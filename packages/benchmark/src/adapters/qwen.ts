import { z } from "zod";
import {
  baseProposal,
  renderMemoryContextForModel,
  type ModelAdapter,
  type ModelDecisionRequest,
} from "../model-adapter.js";

export interface QwenAdapterConfig {
  /** OpenAI-compatible base URL, e.g. an Ollama or vLLM endpoint. */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const ModelReplySchema = z.object({
  proposedAction: z.record(z.string(), z.unknown()).optional(),
  reasoningSummary: z.string().optional(),
  memorySliceIds: z.array(z.string()).optional(),
  requestedEffects: z.array(z.string()).optional(),
});

/**
 * Model-agnostic OpenAI-compatible adapter (targets Qwen-class endpoints such
 * as Ollama/vLLM, but any /chat/completions server works). The model ONLY
 * proposes: it never receives a Sibyl handle, and its proposal is validated
 * downstream via assertAgentProposalAuthorizedByGrant before any influence.
 */
export function createQwenAdapter(config: QwenAdapterConfig = {}): ModelAdapter {
  const model = config.model ?? process.env.ENGRAM_QWEN_MODEL ?? "qwen2.5:7b-instruct";
  const baseUrl = (
    config.baseUrl ?? process.env.ENGRAM_QWEN_BASE_URL ?? "http://127.0.0.1:11434/v1"
  ).replace(/\/$/, "");
  const apiKey = config.apiKey ?? process.env.ENGRAM_QWEN_API_KEY ?? "not-required";
  const temperature = config.temperature ?? 0;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    model,
    modelConfigDigest: `openai-compatible:${model}:temp=${temperature}`,
    async propose(request: ModelDecisionRequest) {
      const system = [
        "You are the decision module of an autonomous execution agent.",
        "You propose one action; you have NO direct access to memory stores, tools, or ledgers.",
        "Reply with ONLY a JSON object, no prose, no code fences, with fields:",
        '  "proposedAction": object (must include "provider": one of the candidate provider ids)',
        '  "reasoningSummary": string',
        '  "memorySliceIds": array of slice ids you relied on (only ids provided to you)',
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

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            stream: false,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
      } catch (error) {
        throw new Error(`QWEN_ADAPTER_REQUEST_FAILED: ${(error as Error).message}`);
      }
      if (!response.ok) {
        throw new Error(`QWEN_ADAPTER_HTTP_${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      let reply: unknown;
      try {
        reply = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim());
      } catch {
        throw new Error(`QWEN_ADAPTER_INVALID_RESPONSE: content was not JSON: ${content.slice(0, 200)}`);
      }
      const parsed = ModelReplySchema.parse(reply);
      return baseProposal({
        request,
        model,
        proposedAction: parsed.proposedAction ?? {},
        reasoningSummary: parsed.reasoningSummary ?? "(model returned no reasoning summary)",
        memorySliceIds: parsed.memorySliceIds ?? [],
        requestedEffects: parsed.requestedEffects ?? [],
      });
    },
  };
}
