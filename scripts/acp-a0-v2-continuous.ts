import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { getPassword, setPassword } from "cross-keychain";
import {
  AcpAgent,
  AcpApiClient,
  ACP_CONTRACT_ADDRESSES,
  ACP_SERVER_URL,
  AssetToken,
  EVM_MAINNET_CHAINS,
  PRIVY_APP_ID,
  PrivyAlchemyEvmProviderAdapter,
  SseTransport,
} from "@virtuals-protocol/acp-node-v2";

const ROOT = process.cwd();
const CHAIN_ID = 8453;
const MAX_SPEND_USDC = 0.03;
const EXPECTED_PRICE_USDC = 0.01;
const EXPECTED_AGENT_ID = "019fe6b5-8dd1-7abe-bf53-9411ca6cae28";
const EXPECTED_OFFERING_ID = "019fe6bb-2166-7d64-bb59-f500142b438a";
const EXPECTED_PROVIDER_WALLET = "0xa4875a9047677cf37f77d53c1eb45e0701fa7d6c";
const REQUIREMENT = { endpoint: "crypto/price", params: { symbol: "BTC" } };
const CONTRACT = await readJson("evidence/canonical/virtuals/a0-preparation/20260907T084541Z/live-benchmark-contract-draft.json");
const DECISION = await readJson("evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/decision.json");
const SNAPSHOT = await readJson("evidence/canonical/virtuals/a0-preparation/20260907T084541Z/candidate-snapshot.json");
const CONFIG = JSON.parse(await readFile(resolve(process.env.HOME ?? "/home/ubuntu", ".config/acp/config.json"), "utf8"));
const ACTIVE_WALLET = String(CONFIG.activeWallet);
const AGENT_CONFIG = CONFIG.agents?.[ACTIVE_WALLET];
if (!AGENT_CONFIG?.id || !AGENT_CONFIG.walletId || !AGENT_CONFIG.publicKey) throw new Error("ACP_ACTIVE_AGENT_SIGNER_CONFIG_INCOMPLETE");
if (DECISION.selectedProvider !== "hermes-data-provider:crypto-market-data") throw new Error("ACP_A0_DECISION_PROVIDER_DRIFT");
if (DECISION.candidateSnapshotDigest !== SNAPSHOT.digest) throw new Error("ACP_A0_DECISION_SNAPSHOT_MISMATCH");
if (DECISION.quotedPriceUsdc > MAX_SPEND_USDC) throw new Error("ACP_A0_DECISION_ABOVE_AUTHORIZED_CEILING");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(ROOT, process.env.ENGRAM_A0_V2_OUT ?? join("evidence/canonical/virtuals/a0-v2", stamp));
await mkdir(outDir, { recursive: true });

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      const secret = /token|secret|private|password|credential|publicKey/i.test(key);
      return [key, secret ? "[REDACTED]" : redact(entry)];
    }));
  }
  return value;
}
async function readJson(path: string): Promise<any> { return JSON.parse(await readFile(resolve(ROOT, path), "utf8")); }
async function writeJson(name: string, value: unknown): Promise<void> { await writeFile(join(outDir, name), `${JSON.stringify(redact(value), null, 2)}\n`); }
function signFn(publicKey: string) {
  const binary = resolve(ROOT, "node_modules/@virtuals-protocol/acp-cli/bin/acp-cli-signer-linux");
  return async (payload: Uint8Array): Promise<string> => {
    const result = JSON.parse(execFileSync(binary, ["sign", "--public-key", publicKey, "--payload", Buffer.from(payload).toString("hex")], { encoding: "utf8" }));
    if (result.error) throw new Error(`ACP_SIGNER_ERROR:${result.error}`);
    return result.signature;
  };
}

const tokenAccount = `agent-token-${ACTIVE_WALLET.toLowerCase()}`;
let authToken = await getPassword("acp-auth", tokenAccount).catch(() => undefined);
const tokenStore = {
  get: () => authToken ?? undefined,
  set: (token: string) => { authToken = token; void setPassword("acp-auth", tokenAccount, token); },
};
const provider = await PrivyAlchemyEvmProviderAdapter.create({
  walletAddress: ACTIVE_WALLET as `0x${string}`,
  walletId: AGENT_CONFIG.walletId,
  signFn: signFn(AGENT_CONFIG.publicKey),
  chains: EVM_MAINNET_CHAINS,
  serverUrl: ACP_SERVER_URL,
  privyAppId: PRIVY_APP_ID,
  builderCode: AGENT_CONFIG.builderCode,
  tokenStore,
});
const transport = new SseTransport({ serverUrl: ACP_SERVER_URL });
const agent = await AcpAgent.create({
  contractAddresses: ACP_CONTRACT_ADDRESSES,
  evmProvider: provider,
  api: new AcpApiClient({ serverUrl: ACP_SERVER_URL }),
  transport,
});

const result: Record<string, any> = {
  schema: "engram.virtuals.a0-v2-continuous/v1",
  evidenceState: "PREPARED",
  experiment: "ACP-A0-v2",
  generatedAt: new Date().toISOString(),
  testedGitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  scientificPurpose: "Remove cross-command/session-rehydration as a confound by keeping the ACP buyer session alive continuously from job creation through funding and terminal observation.",
  controls: { chainId: CHAIN_ID, maxSpendUsdc: MAX_SPEND_USDC, expectedPriceUsdc: EXPECTED_PRICE_USDC, noParallelJobs: true, candidateSnapshotDigest: SNAPSHOT.digest, task: REQUIREMENT, model: { model: DECISION.model, temperature: DECISION.temperature } },
  identity: { agentId: AGENT_CONFIG.id, wallet: ACTIVE_WALLET, signerConfigured: true, signerMaterial: "[REDACTED]" },
  decision: { source: "evidence/canonical/virtuals/a0-live-execution/20260909T104849Z/decision.json", selectedProvider: DECISION.selectedProvider, providerAgentId: DECISION.providerAgentId, offeringId: DECISION.offeringId, quotedPriceUsdc: DECISION.quotedPriceUsdc, reusedFrozenValidDecision: true },
  sideEffects: { jobCreated: false, funded: false, replacementJobs: 0 },
};
await writeJson("preflight.json", result);

try {
  await agent.start();
  result.continuousAgent = { started: true, processPid: process.pid, startObservedAt: new Date().toISOString() };
  const agents = await agent.browseAgents("crypto market data", { topK: 20 });
  const providerDetail = agents.find((item) => item.id === EXPECTED_AGENT_ID && item.walletAddress.toLowerCase() === EXPECTED_PROVIDER_WALLET && item.chains.some((chain) => chain.chainId === CHAIN_ID));
  if (!providerDetail) throw new Error("ACP_A0_V2_PROVIDER_DRIFT_OR_UNAVAILABLE");
  const offering = providerDetail.offerings.find((item) => item.name === "Crypto & Market Data" && item.priceValue === EXPECTED_PRICE_USDC && item.slaMinutes === 5);
  if (!offering) throw new Error("ACP_A0_V2_OFFERING_DRIFT_OR_UNAVAILABLE");
  result.providerVerification = { agentId: providerDetail.id, wallet: providerDetail.walletAddress, offeringName: offering.name, priceUsdc: offering.priceValue, slaMinutes: offering.slaMinutes, chainId: CHAIN_ID };
  const jobId = await agent.createJobFromOffering(CHAIN_ID, offering, providerDetail.walletAddress, REQUIREMENT, { evaluatorAddress: ACTIVE_WALLET });
  result.job = { jobId: jobId.toString(), chainId: CHAIN_ID, client: ACTIVE_WALLET, provider: providerDetail.walletAddress, offering: offering.name, createdAt: new Date().toISOString() };
  result.sideEffects.jobCreated = true;
  const session = agent.getSession(CHAIN_ID, jobId.toString());
  if (!session) throw new Error("ACP_A0_V2_LIVE_SESSION_NOT_FOUND_AFTER_CREATE");
  result.continuousSession = { found: true, jobId: session.jobId, chainId: session.chainId, roles: session.roles, sameObjectAcrossPhases: true };
  await session.fetchJob();
  await writeJson("after-create.json", result);
  if (EXPECTED_PRICE_USDC > MAX_SPEND_USDC) throw new Error("ACP_A0_V2_FUNDING_ABOVE_CEILING");
  await session.fund(AssetToken.usdc(EXPECTED_PRICE_USDC, CHAIN_ID));
  result.sideEffects.funded = true;
  result.funding = { amountUsdc: EXPECTED_PRICE_USDC, asset: "USDC", chainId: CHAIN_ID, fundedAt: new Date().toISOString(), sameSession: true };
  await writeJson("after-fund.json", result);
  const terminal = new Set(["completed", "rejected", "expired"]);
  const deadline = Date.now() + 360_000;
  let job: any = null;
  while (Date.now() < deadline) {
    job = await session.fetchJob();
    result.observation = { status: job.status, observedAt: new Date().toISOString(), sameSession: true };
    if (terminal.has(String(job.status).toLowerCase())) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
  }
  const history = await transport.getHistory(CHAIN_ID, jobId.toString());
  result.terminal = { status: job?.status ?? "UNKNOWN", reached: terminal.has(String(job?.status).toLowerCase()), historyEntryCount: history.length, observedAt: new Date().toISOString(), sameSession: true };
  result.authenticU0 = { status: "PENDING_UTILITY_COMPONENTS", label: "AUTHENTIC_EXTERNAL_A0", costUsdc: EXPECTED_PRICE_USDC, historyEntryCount: history.length };
  await writeJson("history.json", history);
  await writeJson("final.json", result);
} catch (error) {
  result.evidenceState = "BLOCKED_OR_FAILED_EXTERNAL";
  result.failure = { name: error instanceof Error ? error.constructor.name : "Error", message: error instanceof Error ? error.message : String(error), observedAt: new Date().toISOString() };
  await writeJson("failure.json", result);
  process.exitCode = 1;
} finally {
  await agent.stop().catch(() => undefined);
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
