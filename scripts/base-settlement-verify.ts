import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  fetchBaseChainId,
  fetchBaseTransactionReceipt,
  verifyBaseSettlementReceipt,
} from "../packages/base-settlement/src/evidence.js";
import { parseSerializedBaseSettlementIntent } from "../packages/base-settlement/src/index.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

const intentPathArg = arg("--intent");
const transactionHash = arg("--tx-hash");
const rpcUrl = arg("--rpc-url") ?? process.env.ENGRAM_BASE_RPC_URL;
const expectedPayer = arg("--payer") ?? process.env.ENGRAM_BASE_EXPECTED_PAYER;
const outPathArg = arg("--out") ?? process.env.ENGRAM_BASE_EVIDENCE_OUT;

if (!intentPathArg || !transactionHash || !rpcUrl) {
  throw new Error(
    "Usage: npm run base:settlement:verify -- --intent <intent.json> --tx-hash <0x...> [--rpc-url <url>] [--payer <0x...>] [--out <evidence.json>] "
    + "or set ENGRAM_BASE_RPC_URL / ENGRAM_BASE_EXPECTED_PAYER / ENGRAM_BASE_EVIDENCE_OUT",
  );
}

const intentPath = resolve(intentPathArg);
const intentBytes = await readFile(intentPath);
const raw = JSON.parse(intentBytes.toString("utf8")) as unknown;
const intent = parseSerializedBaseSettlementIntent(raw);
const observedChainId = await fetchBaseChainId({ rpcUrl });
const receipt = await fetchBaseTransactionReceipt({ rpcUrl, transactionHash });
const settlement = verifyBaseSettlementReceipt({
  intent,
  receipt,
  observedChainId,
  expectedPayer,
});

const evidence = {
  schema: "engram.base-live-settlement-evidence/v1",
  capturedAt: new Date().toISOString(),
  intent: {
    file: intentPath,
    sha256: sha256(intentBytes),
    executionId: intent.provenance.executionId,
    retrievalId: intent.provenance.retrievalId,
    decisionId: intent.provenance.decisionId,
    memoryRefs: intent.memoryRefs,
  },
  verification: {
    observedChainId,
    expectedPayer: expectedPayer ?? null,
    transactionHash,
    receiptBlockNumber: receipt.blockNumber,
  },
  settlement,
  evidenceBoundary: "This file records independently verified Base settlement evidence. It is only partner-qualifying when the transaction itself occurred in the eligible build window and the referenced intent came from the retained fresh-memory decision path.",
};

if (outPathArg) {
  const outPath = resolve(outPathArg);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
