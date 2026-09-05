import { createHash, createHmac } from "node:crypto";
import {
  baseProposal,
  parseModelJsonObject,
  renderMemoryContextForModel,
  type ModelAdapter,
  type ModelDecisionRequest,
} from "../model-adapter.js";

export interface BedrockAdapterConfig {
  /** Foundation model id, e.g. "us.meta.llama3-1-8b-instruct-v1:0" or "us.amazon.nova-micro-v1:0". */
  modelId?: string;
  region?: string;
  temperature?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

function encodeRfc3986(value: string): string {
  return value.replace(/[^A-Za-z0-9\-._~]/g, (char) => {
    const bytes = Buffer.from(char, "utf8");
    return Array.from(bytes.values()).map((byte) => `%${byte.toString(16).toUpperCase()}`).join("");
  });
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export function resolveBedrockCredentials(): BedrockCredentials {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "BEDROCK_ADAPTER_NO_CREDENTIALS: set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN for temporary credentials) in the environment.",
    );
  }
  return { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN };
}

/**
 * Signs a POST to the Bedrock Converse API (SigV4, service "bedrock") with
 * node:crypto only — no AWS SDK dependency, matching the repo's minimal-deps
 * policy. Credentials come from the standard AWS_* environment variables and
 * never leave the process.
 */
export async function bedrockConverse(
  config: Required<Pick<BedrockAdapterConfig, "modelId" | "region">> & { temperature: number },
  systemPrompt: string,
  userPrompt: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const credentials = resolveBedrockCredentials();
  const region = config.region;
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeRfc3986(config.modelId)}/converse`;
  const url = `https://${host}${path}`;

  const now = new Date();
  // ISO → basic format: 2026-09-05T12:37:56.123Z → 20260905T123756Z
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payload = JSON.stringify({
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content: [{ text: userPrompt }] }],
    inferenceConfig: { temperature: config.temperature },
  });
  const payloadHash = sha256Hex(payload);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
  };
  if (credentials.sessionToken) headers["x-amz-security-token"] = credentials.sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "bedrock");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { ...headers, authorization },
    body: payload,
  });
  if (!response.ok) {
    throw new Error(`BEDROCK_ADAPTER_HTTP_${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as {
    output?: { message?: { content?: Array<{ text?: string }> } };
  };
  const text = data.output?.message?.content
    ?.map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("BEDROCK_ADAPTER_EMPTY_RESPONSE");
  return text;}

/**
 * Bedrock adapter for the "AWS low models" benchmark track (Llama / Nova via
 * the Converse API). Like every adapter it only PROPOSES: it receives rendered
 * memory, never a Sibyl handle, and its output is validated downstream via
 * assertAgentProposalAuthorizedByGrant before any influence is granted.
 */
export function createBedrockAdapter(config: BedrockAdapterConfig = {}): ModelAdapter {
  const modelId = config.modelId ?? process.env.ENGRAM_BEDROCK_MODEL_ID ?? "us.meta.llama3-1-8b-instruct-v1:0";
  const region = config.region ?? process.env.ENGRAM_BEDROCK_REGION ?? process.env.AWS_REGION ?? "us-west-2";
  const temperature = config.temperature ?? 0;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    model: `bedrock:${modelId}`,
    modelConfigDigest: `bedrock-converse:${modelId}:region=${region}:temp=${temperature}`,
    async propose(request: ModelDecisionRequest) {
      const system = [
        "You are the decision module of an autonomous execution agent.",
        "You propose one action; you have NO direct access to memory stores, tools, or ledgers.",
        "Reply with ONLY a JSON object, no prose, no code fences, with fields:",
        '  "proposedAction": object (must include "provider": one of the candidate provider ids)',
        '  "reasoningSummary": string',
        '  "memorySliceIds": array of the SLICE-n labels you relied on (only labels provided to you)',
        '  "requestedEffects": array of strings chosen ONLY from effects explicitly allowed by the provided influence grants (empty list if none apply)',
      ].join(" ");

      const user = [
        `MANDATE: urgency=${request.mandate.urgency}, verificationRequired=${request.mandate.verificationRequired}, maxLatencySeconds=${request.mandate.maxLatencySeconds}, maxBudgetUsd=${request.mandate.maxBudgetUsd}`,
        "CANDIDATES:",
        ...request.candidates.map((candidate) =>
          JSON.stringify({
            providerId: candidate.providerId,
            costUsd: candidate.costUsd,
            expectedLatencySeconds: candidate.expectedLatencySeconds,
          }),
        ),
        "MEMORY CONTEXT:",
        renderMemoryContextForModel(request.memory),
      ].join("\n");

      const content = await bedrockConverse(
        { modelId, region, temperature },
        system,
        user,
        fetchImpl,
      );

  const reply = parseModelJsonObject(content, "BEDROCK_ADAPTER");
      const parsed = reply as {
        proposedAction?: Record<string, unknown>;
        reasoningSummary?: string;
        memorySliceIds?: string[];
        requestedEffects?: string[];
      };
      return baseProposal({
        request,
        model: `bedrock:${modelId}`,
        proposedAction: parsed.proposedAction ?? {},
        reasoningSummary: parsed.reasoningSummary ?? "(model returned no reasoning summary)",
        memorySliceIds: parsed.memorySliceIds ?? [],
        requestedEffects: parsed.requestedEffects ?? [],
      });
    },
  };
}
