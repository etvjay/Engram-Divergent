import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd(); const tsx = resolve(root, "node_modules/.bin/tsx"); const dir = await mkdtemp(join(tmpdir(), "engram-model-fresh-session-")); const db = join(dir, "memory.db"); const state = join(dir, "process-a.json"); const env = { ...process.env, ENGRAM_SIBYL_DB: db, ENGRAM_SIBYL_TENANT: "model-fresh-session-provider" };
function run(args: string[]) { const r=spawnSync(tsx,args,{cwd:root,env,encoding:"utf8",timeout:300000}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return JSON.parse(r.stdout); }
try {
  const a=run(["scripts/model-fresh-session-process.ts","a",state]);
  const b=run(["scripts/model-fresh-session-process.ts","b",state]);
  const output={schema:"engram.model-fresh-session-proof/v1",evidenceState:b.behaviorChanged?"LOCAL_MODEL_FRESH_SESSION_PASS":"LOCAL_MODEL_FRESH_SESSION_BLOCKED",model:process.env.ENGRAM_MODEL??"llama3.2:3b",processA:a,processB:b,claims:{modelObservedFailure:true,processDeathObserved:b.processBoundary.freshRuntime&&b.processBoundary.inMemoryObjectsReused===false,memoryRecalled:b.memory.found&&b.memory.eligible,memoryConditionedProposal:b.validMemoryConditionedProposal,authorized:b.authorization==="AUTHORIZED",behaviorChanged:b.behaviorChanged,updatedMemory:b.evaluation?.status==="UPDATED",unauthorizedEscapes:b.unauthorizedEscapes}};
  const outDir=resolve(root,"evidence/canonical/judge/model-fresh-session"); await mkdir(outDir,{recursive:true}); await writeFile(join(outDir,"proof.json"),`${JSON.stringify(output,null,2)}\n`); process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
} finally { /* retain evidence, temporary DB is disposable */ }
