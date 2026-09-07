import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const ledgerPath = resolve(root, "evidence/evals/observation-ledger.jsonl");
const rows = readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as any);
const canonical = rows.filter((row) => String(row.observationId).includes("-canonical-"));
if (canonical.length === 0) throw new Error("CANONICAL_LEDGER_ENTRY_REQUIRED");
for (const row of canonical) {
  const testedGitSha = row.controls?.testedGitSha;
  if (typeof testedGitSha !== "string" || !/^[0-9a-f]{40}$/.test(testedGitSha)) throw new Error(`CANONICAL_TESTED_SHA_INVALID:${row.observationId}`);
  try { execFileSync("git", ["cat-file", "-e", `${testedGitSha}^{commit}`], { cwd: root, stdio: "ignore" }); }
  catch { throw new Error(`CANONICAL_TESTED_SHA_UNRESOLVABLE:${row.observationId}:${testedGitSha}`); }
  for (const ref of row.evidenceRefs ?? []) {
    const absolute = resolve(root, ref);
    if (!existsSync(absolute)) throw new Error(`CANONICAL_EVIDENCE_MISSING:${row.observationId}:${ref}`);
    try { execFileSync("git", ["ls-files", "--error-unmatch", ref], { cwd: root, stdio: "ignore" }); }
    catch { throw new Error(`CANONICAL_EVIDENCE_UNTRACKED:${row.observationId}:${ref}`); }
  }
}
process.stdout.write(JSON.stringify({ canonicalObservations: canonical.length, canonicalReferencesTracked: true, canonicalMissingReferences: 0, testedShasResolvable: true }) + "\n");
