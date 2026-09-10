import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd(); const tsx = resolve(root, "node_modules/.bin/tsx"); const dir = await mkdtemp(join(tmpdir(), "engram-mcp-active-agent-")); const db = join(dir, "memory.db"); const state = join(dir, "process-a.json"); const env = { ...process.env, ENGRAM_SIBYL_DB: db, ENGRAM_SIBYL_TENANT: "mcp-active-agent" };
function run(args: string[]) { const r = spawnSync(tsx, args, { cwd: root, env, encoding: "utf8", timeout: 300000 }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout); }
const a = run(["scripts/mcp-active-agent-process.ts", "a", state]);
const b = run(["scripts/mcp-active-agent-process.ts", "b", state]);
const claims = { ...b.claims, processBoundary: b.freshRuntime && b.inMemoryObjectsReused === false, baselineNoMemory: b.baseline.passed, activeMcpPath: b.claims.agentRequestedRecall && b.claims.influenceAuthorized };
const output = { schema: "engram.mcp-active-agent-proof/v1", evidenceState: Object.values(claims).every((value) => value === true || value === 0) ? "LOCAL_MODEL_MCP_ACTIVE_AGENT_PASS" : "LOCAL_MODEL_MCP_ACTIVE_AGENT_BLOCKED", model: process.env.ENGRAM_MODEL ?? "llama3.2:3b", processA: a, processB: b, claims };
const outDir = resolve(root, "evidence/canonical/judge/mcp-active-agent"); await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, "proof.json"), `${JSON.stringify(output, null, 2)}\n`); process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
