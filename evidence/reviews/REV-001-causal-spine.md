# REV-001 — Engram Causal Spine Adversarial Review

Date: 2026-08-16
Scope: protocol, runtime, persistence, policy, adapters, API/MCP surfaces, evaluation, and live-verification path.

## Verdict

The causal spine is implementation-grade and testable, but several external claims remain deliberately unpromoted until credentialed live evidence exists. The principal remaining risk is not semantic incompleteness; it is overclaiming infrastructure properties that automated repository CI cannot prove.

## Attack matrix

### A1 — Retrieved memory is mistaken for causal influence
**Attack:** A memory appears in context, but the later action would have been identical without it.

**Status:** PASS at protocol/runtime level.

**Controls:**
- decision-memory influence is a first-class relation;
- `CHANGED_ACTION` requires explicit influence provenance;
- policy can require a counterfactual;
- the demo records a memory-free Run A and memory-influenced Run B;
- runtime evaluation events record accepted/rejected influence separately from retrieval.

**Residual risk:** applications may lie about their declared counterfactual. Controlled experiments or independent replay are stronger evidence than application declaration.

### A2 — Recall occurred but memory was never exposed to the agent
**Attack:** persistence records retrieval candidates and a later decision claims influence even though runtime filtering rejected the memory.

**Status:** PASS.

**Controls:** retrieval candidates are fail-closed; results begin unexposed and only runtime policy may mark accepted results `exposed_to_agent=true`. Influence validation reloads persisted recalls, supporting Lambda cold starts.

### A3 — Lambda restart loses recall/influence state
**Attack:** recall happens in one invocation and the decision happens in another cold process.

**Status:** PASS in automated conformance; LIVE EXTERNAL remains separate.

**Controls:** CockroachDB persists retrievals/results and exposure state; cold-start tests construct a fresh runtime before recording influence.

### A4 — Policy changes halfway through an execution
**Attack:** Run starts under v1, operator activates v2, later recall silently follows v2.

**Status:** PASS.

**Controls:** scoped policy resolution occurs at execution start; the resolved bundle version is frozen on the execution; later invocations reload the frozen version.

### A5 — Retired/stale memory continues influencing behavior
**Attack:** a memory remains semantically similar but environment/tool conditions changed.

**Status:** PASS for deterministic expiry/version gates; PARTIAL for higher-order semantic staleness.

**Controls:** valid-until, environment-version, tool-version and configurable age invalidation are evaluated before exposure/influence.

**Residual risk:** real-world invalidation can require domain evidence that cannot be inferred from version strings alone. Evaluation relationships should record supersession/contradiction explicitly.

### A6 — Contradictory memories overwrite history
**Attack:** newer derived memory replaces older evidence, destroying provenance.

**Status:** PASS by data model.

**Controls:** memories and source execution history are append-oriented; contradiction/supersession are modeled as relationships rather than destructive overwrite.

### A7 — Semantic similarity is treated as contradiction
**Attack:** vector proximity is used to infer that two memories conflict.

**Status:** PASS.

**Controls:** conflict is an explicit assessed relationship with rationale/evidence/method. Vector search is retrieval, not adjudication.

### A8 — Successful later outcome is automatically called "memory usefulness"
**Attack:** treatment succeeds after recall, so system labels memory beneficial without a control.

**Status:** PASS.

**Controls:** usefulness has a separate evaluation domain; effect/evidence/method and controlled experiments are persisted. Retrieval or later success alone is insufficient.

### A9 — Cross-agent memory leakage
**Attack:** memory from Agent X affects Agent Y because semantic retrieval ignores identity.

**Status:** PASS in repository query contract; requires live regression evidence for production deployment.

**Controls:** retrieval is scoped by canonical agent identity. Live verifier also generates an isolated agent ID per proof run.

### A10 — C-SPANN is claimed merely because a VECTOR index exists
**Attack:** retrieval works but CockroachDB executes a scan instead of the distributed vector index.

**Status:** OPEN — claim remains IMPLEMENTED, not VERIFIED.

**Required evidence:** live `EXPLAIN`/query-plan evidence demonstrating the vector index is selected on the production retrieval query. Successful semantic retrieval alone is insufficient.

### A11 — Bedrock is claimed although tests use deterministic embeddings
**Attack:** adapter exists but production path never invokes Titan Embeddings V2.

**Status:** OPEN externally; implementation path is correct.

**Required evidence:** credentialed live verifier using `TitanEmbeddingProvider`, with provider/model/dimension metadata captured in evidence.

### A12 — Managed MCP is claimed because listTools succeeds
**Attack:** MCP connects, but provenance inspection itself fails or uses an unintended write capability.

**Status:** OPEN externally; implementation guard is strong.

**Controls:** code-level read-tool allowlist; live verifier requires both MCP connection and actual provenance `select_query` output.

### A13 — Simulated workload masquerades as live execution
**Attack:** successful Run B is presented as a real venue execution.

**Status:** PASS.

**Controls:** simulator observations use `SIMULATED`; claims ledger explicitly marks the external workload as simulated; health endpoint is workload-neutral and isolates demo simulation.

### A14 — Runtime evaluation metadata is mislabeled as objective execution evidence
**Attack:** policy decisions such as recall rejection are stored as if they were external-world events.

**Status:** PASS.

**Controls:** runtime evaluation events are stored separately from execution event history.

### A15 — Framework adapter invents causal decisions from telemetry
**Attack:** OpenAI Agents/LangGraph events are translated into Engram decisions/influences automatically.

**Status:** PASS.

**Controls:** adapters translate external execution telemetry/checkpoint state into `ExecutionEpisode` evidence; decisions and memory influence require explicit application/runtime recording.

### A16 — API/MCP/SDK surfaces implement divergent semantics
**Attack:** one client bypasses runtime eligibility checks and writes provenance directly.

**Status:** PASS for current semantic surfaces.

**Controls:** execution-scoped TypeScript/Python HTTP clients and Engram MCP target the runtime model; low-level memory search remains explicitly marked legacy/read-oriented during migration.

### A17 — Control plane becomes an unprotected mutation plane
**Attack:** dashboard/API allows arbitrary policy/memory mutation without authorization/audit.

**Status:** PASS for current scope.

**Controls:** newly exposed control-plane/evaluation routes are read-only. Policy registry mutation exists as backend capability but is not exposed as an unauthenticated public API.

**Residual risk:** before production policy mutation is exposed, add authentication, authorization, actor identity, immutable audit log, and change-review semantics.

### A18 — Database idempotency hides mismatched duplicate IDs
**Attack:** `ON CONFLICT DO NOTHING` accepts a repeated identifier carrying different semantic content.

**Status:** OPEN hardening item.

**Required work:** for semantically important idempotent writes, compare canonical payload/hash on conflict and reject mismatches rather than silently accepting them.

### A19 — Trace reconstruction duplicates or obscures provenance
**Attack:** multi-source joins duplicate decisions/memories and create ambiguous reconstructed lineage.

**Status:** PARTIAL.

**Required work:** add trace-shape conformance tests for multi-source memories, multiple recalls, multiple decisions, and repeated influence across one execution.

### A20 — Live proof artifact exists only on success
**Attack:** failed verification leaves no structured evidence boundary, only CI logs.

**Status:** OPEN hardening item.

**Required work:** write a sanitized failure artifact with `verificationKind`, failure stage, and UNKNOWN/FAILED boundaries before process exit, then upload it with `if: always()`.

## Required next evidence promotions

1. Run the canonical `Engram Live Verification` workflow with CockroachDB, AWS Bedrock, and Managed MCP credentials.
2. Add live query-plan evidence before promoting the C-SPANN/index claim.
3. Validate `sam build` and deploy the Lambda/API; exercise health, runtime demo, one execution trace, one control-plane read, and one memory-evaluation read.
4. Promote claims only from the resulting artifacts; do not infer LIVE VERIFIED from normal CI.

## Conclusion

Engram now has a coherent execution-memory protocol rather than a collection of memory features. The remaining work is concentrated in external verification, stronger idempotency/trace hardening, and production security around future mutation surfaces. The external workload remains intentionally simulated; that boundary should remain explicit even after infrastructure components are live verified.
