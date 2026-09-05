# Build Order

Build order follows evaluator-critical dependency, not architectural elegance.

## P0 — Gate survival
1. Probe and lock current Sibyl API/package behavior.
2. Implement `ExecutionMemoryStore` abstraction only where required.
3. Implement `SibylMemoryStore`.
4. Route hackathon profile's decision-critical persist/recall exclusively through Sibyl.
5. Prove process-boundary fresh-session recall.
6. Implement deletion-test mode that disables/removes Sibyl and demonstrates core degradation/failure.
7. Preserve Engram source-execution -> memory -> recall -> influence provenance.

## P1 — Score maximization
8. Add paired no-memory control versus Sibyl-memory execution.
9. Add stale/incompatible/conflicting memory negative tests.
10. Add one compelling real-world scenario beyond route failure if time allows: agent-provider relationship continuity is preferred.
11. Make trace/evidence visible to a cold evaluator.

## P2 — Partner multiplier
12. Evaluate Base integration only if it produces a real economic/onchain consequence from recalled memory.
13. Evaluate Virtuals only if an ACP/native interaction creates or consumes decision-relevant experience.
14. Prefer one native partner that strengthens the product over two decorative integrations.

## P3 — Submission
15. README Prior Work declaration and critical memory call map.
16. 2–5 minute continuous fresh-session demo choreography.
17. Build-log post + demo post.
18. Cold evaluator run.
19. Re-run truth freeze.
20. Freeze submission.

## Explicitly deferred
- replacing canonical CockroachDB architecture;
- registry publication work unrelated to judging;
- broad framework integrations;
- production multi-tenant auth upgrades unless necessary for public demo safety;
- partner integrations without a causal role in the core scenario.
