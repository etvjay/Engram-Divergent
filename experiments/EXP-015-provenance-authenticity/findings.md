# EXP-015 — Findings

Date: 2026-08-16
Evidence run: GitHub Actions Engram CI `31944577594`
Result: **PASS**

## Findings

1. A high-scoring Operational Memory with real same-agent source executions remained recall-eligible.
2. A memory claiming a nonexistent source execution was filtered before exposure.
3. A memory claiming a source execution owned by another agent was filtered before exposure.
4. Contradictory `sourceExecutionId` and `sourceExecutionIds` declarations were rejected.
5. Provenance was revalidated before decision influence rather than trusted indefinitely from the prior recall.
6. When the source became unavailable after recall, the attempted influence failed closed, no decision was persisted, and the runtime emitted `INFLUENCE_REJECTED`.
7. Retrieval score, confidence, workflow match, environment compatibility and tool compatibility did not override invalid provenance.
8. Legacy Operational Memories with no declared source lineage remain compatible; Engram does not fabricate missing provenance for them.

## Interpretation

Engram now treats provenance as an **authority precondition**, not decorative metadata.

The runtime already validated explicit multi-source lineage during memory admission. EXP-015 closes the later-use gap: a persisted or externally introduced memory that claims provenance must still reconcile with canonical execution history before exposure and before influence.

This matters for imports, migrations, restores, direct database writes, corruption scenarios and other paths that may bypass normal admission semantics.

## Failure history

An initial implementation run, CI `31944472053`, failed during TypeScript compilation because a file update truncated the runtime import block. No semantic evidence was promoted from that run. The runtime was restored and the invariant was retained. CI `31944534433` then passed the four recall-side provenance cases. The final acceptance run `31944577594` additionally passed influence-time revalidation.

## Boundary

The fixtures are deterministic and **SIMULATED**. This experiment does not prove cryptographic source authenticity, signed episodes, immutable database history, tamper-evident storage, or production cross-tenant isolation.