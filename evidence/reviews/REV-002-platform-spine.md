# REV-002 — Engram Platform Spine Adversarial Review

Date: 2026-08-16
Scope: runtime, persistence, policy, SDK/API/MCP surfaces, adapters, control plane, evaluation, live verification

## Review standard

A platform-level Engram claim is accepted only when the implementation preserves the execution-memory invariant across persistence, retrieval, exposure, influence, behavior, and provenance. Convenience surfaces do not receive independent authority to reinterpret memory semantics.

## Findings

### 1. Retrieved does not mean exposed

Attack: a database query can return a memory while runtime policy rejects it, yet later code could still claim that memory influenced the decision.

Current mitigation: retrieval results are persisted fail-closed. Candidates begin unexposed and the runtime explicitly promotes only policy-accepted candidates. Decision influence validation reloads persisted recall state rather than trusting process memory.

Residual risk: live CockroachDB proof is still required to confirm the deployed schema and transaction path preserve this invariant under real concurrency.

Status: MITIGATED / LIVE UNVERIFIED.

### 2. Exposed does not mean influential

Attack: placing memory in agent context could be presented as causal influence even if the selected action would be identical without it.

Current mitigation: Engram requires explicit decision-memory relations. CHANGED_ACTION requires a counterfactual under policy, and the demonstration records the memory-free control action and comparison execution.

Residual risk: applications may dishonestly declare counterfactuals. Evidence state and counterfactual source must remain visible; Engram must not silently upgrade application-declared counterfactuals into verified causal facts.

Status: MITIGATED.

### 3. Later success does not prove memory usefulness

Attack: treatment succeeds after a memory was recalled, so the memory is automatically labeled beneficial.

Current mitigation: usefulness is a separate evaluation domain. BENEFICIAL/HARMFUL/NEUTRAL/UNKNOWN effects require explicit evaluation records and method metadata such as CONTROL_RUN, SHADOW_RUN, REPLAY, or observational/human assessment. Retrieval counts and changed-action counts are telemetry, not benefit labels.

Residual risk: downstream UI and documentation could collapse these fields into a single score. Control-plane responses must preserve the interpretation boundary.

Status: MITIGATED.

### 4. Policy activation changes an in-flight execution

Attack: a new memory policy is activated between recall and decision, silently changing the rules governing the run.

Current mitigation: scoped policy is resolved at execution start and its bundle version is persisted on the execution. Later runtime invocations reload that exact bundle. New policy activation affects new executions, not existing ones.

Residual risk: deleting immutable historical bundles would break replay. Registry semantics must continue forbidding mutation/destructive replacement of referenced policy versions.

Status: MITIGATED.

### 5. Serverless cold start loses recall state

Attack: recall happens in Lambda invocation A; decision is recorded in invocation B where process memory is empty.

Current mitigation: recall/exposure state is persisted in CockroachDB and decision validation reconstructs it from the runtime store.

Status: MITIGATED / LIVE UNVERIFIED.

### 6. Concurrent observations collide on sequence numbers

Attack: two invocations compute `events.length` concurrently and insert the same sequence number.

Current mitigation: runtime supports a store-side atomic sequence allocator and tests prefer it over trace-length derivation where available.

Residual risk: the Cockroach implementation must be covered by live concurrency testing before claiming production-grade event ordering.

Status: MITIGATED / LOAD UNVERIFIED.

### 7. Memory leaks across agents or tenants

Attack: semantically similar memory from another agent is retrieved and influences the current execution.

Current mitigation: retrieval is agent-scoped and the live verifier creates a unique agent identity per proof run. The latest vector-index migration also scopes the C-SPANN search index by agent ID.

Residual risk: the MVP does not yet constitute a complete multi-tenant authorization model. API authentication/authorization and tenant isolation remain production work.

Status: PARTIALLY MITIGATED.

### 8. Stale environment or tool memory remains actionable

Attack: a valid lesson from an old environment or tool major version constrains a later incompatible execution.

Current mitigation: memory carries environment/tool/policy versions, expiry fields, and runtime expiry/invalidation policy can reject mismatches.

Residual risk: compatibility semantics are policy-defined and require workload-specific configuration; version strings alone do not prove incompatibility.

Status: MITIGATED BY POLICY.

### 9. Contradictory memories overwrite history

Attack: a newer conclusion destroys an older one, preventing reconstruction of why historical decisions were made.

Current mitigation: history is append-oriented. Memory relationships can record contradiction/supersession explicitly rather than overwriting source evidence.

Residual risk: conflict must not be inferred solely from vector proximity. Current evaluation design requires an explicit assessed relationship.

Status: MITIGATED.

### 10. Framework adapter invents Engram causality

Attack: an OpenAI Agents trace or LangGraph checkpoint is translated into an Engram decision/influence without application evidence.

Current mitigation: adapters translate external telemetry into ExecutionEpisode evidence. They do not infer memory-to-action causality or silently turn framework state into Operational Memory.

Status: MITIGATED.

### 11. Control Plane becomes a write bypass

Attack: dashboard/API code directly edits memory or provenance, bypassing runtime policy and validation.

Current mitigation: the Control Plane store and current HTTP routes are read-focused. Runtime mutation remains on the execution lifecycle surface; policy/evaluation mutation has separate explicit contracts.

Residual risk: future admin features must not mutate causal records in place. Corrections should be append-oriented and attributable.

Status: MITIGATED.

### 12. Unknown/read routes accidentally require database configuration

Attack: eager construction of the Cockroach store makes `/health` or an unknown route fail when DATABASE_URL is absent, coupling routing correctness to infrastructure availability.

Current mitigation: health is infrastructure-independent and control-plane store construction is route-scoped/lazy. API contract tests cover this boundary.

Status: MITIGATED.

### 13. Vector query success is misreported as C-SPANN index usage

Attack: a live vector query succeeds through a full scan, but evidence states that CockroachDB C-SPANN accelerated the retrieval.

Current mitigation: live verification now runs `EXPLAIN` over the production retrieval query shape, records the raw plan, and separates `vectorDistanceRetrieval` from `cspannCosineIndexUsage`. The expected index is agent-scoped and uses `vector_cosine_ops`, matching Engram's `<=>` retrieval metric.

Required live proof: the credentialed artifact must show the optimizer naturally selected `memories_agent_embedding_cosine_idx`. If it does not, the artifact leaves C-SPANN usage UNVERIFIED and ENG-003 is not promoted.

Status: MITIGATED MECHANICALLY / LIVE PLAN UNVERIFIED.

### 14. Adapter/cloud implementation is mistaken for live verification

Attack: presence of Bedrock/MCP/Cockroach code is presented as proof the remote services were exercised.

Current mitigation: implementation/test claims are separated from live external evidence. The credentialed live-verification workflow must emit `evidence/live/latest.json` before promotion.

Status: MITIGATED.

### 15. Live verifier failure leaves no durable negative evidence

Attack: live verification fails before the success artifact is written; only ephemeral workflow logs explain the boundary.

Current mitigation: the verifier catches failures, sanitizes likely credentials from the error, writes `evidence/live/latest.json` with `evidenceClass: UNKNOWN`, records the failed stage and commit/run IDs, and leaves unproven boundaries UNKNOWN. The workflow uploads the evidence directory even on failure.

Residual risk: sanitization must remain conservative as new provider error formats are introduced.

Status: MITIGATED.

### 16. Simulated execution is mistaken for live venue operation

Attack: real persistence/retrieval is used to imply that external multi-venue actions were also live.

Current mitigation: demo observations and evidence boundaries label external execution SIMULATED. The API health boundary says application-defined external execution and specifically marks demo external execution SIMULATED.

Status: MITIGATED.

## Blocking items before stronger production claims

1. Run the canonical credentialed live-verification workflow successfully.
2. Confirm the live EXPLAIN plan naturally selects `memories_agent_embedding_cosine_idx`; otherwise keep C-SPANN usage unverified and tune the query/index without forcing a proof-only hint.
3. Validate SAM build/deployment and exercise health, runtime demo, trace, and control-plane reads through the public endpoint.
4. Add authentication/authorization and tenant isolation before claiming multi-tenant production readiness.
5. Run concurrency/load verification for event sequencing, serializable retries, and idempotency.

## Decision

The platform spine is coherent enough to continue. The principal architectural boundaries are preserved: applications own decisions and external execution; Engram owns operational-memory lifecycle, policy enforcement, retrieval exposure, influence provenance, and evaluation records. The remaining high-risk claims are external verification and production-hardening claims, not missing core semantics.
