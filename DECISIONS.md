# Engram Decisions

This file records architectural decisions that materially affect the Execution Memory invariant.

## D-001 — Engram is the product; Execution Memory is the primitive

**Status:** ACCEPTED

Engram is the canonical product/system name. Execution Memory is the primitive Engram implements.

## D-002 — Domain core remains adapter-independent

**Status:** ACCEPTED

`memory-core` must not depend on CockroachDB, Bedrock, MCP, AWS, or the demo simulator. Adapters depend on the core.

## D-003 — CockroachDB is the canonical operational memory substrate

**Status:** ACCEPTED

Structured execution state, provenance, decisions, outcomes, runtime evaluations, policy assignments, explicit evaluation evidence, and vector embeddings live in CockroachDB. The MVP does not use a separate vector database.

## D-004 — MCP is an agent-facing read/inspection plane, not the transactional write path

**Status:** ACCEPTED

Deterministic application writes use the PostgreSQL-compatible CockroachDB driver. Managed MCP is used for schema/database inspection, read-only provenance inspection, SELECT, and EXPLAIN-style agent operations. Engram MCP exposes Engram semantics rather than raw SQL semantics.

## D-005 — The demo workload is simulated; the memory substrate is not

**Status:** ACCEPTED

The venue execution scenario is deterministic and explicitly `SIMULATED`. Persistence, retrieval, memory-decision links, runtime influence validation, and trace reconstruction are real repository/runtime operations. Live verification upgrades only external integrations that were actually exercised.

## D-006 — Memory-caused behavior requires an explicit influence edge

**Status:** ACCEPTED

Retrieval alone is not evidence of influence. A consequential memory must be recorded in `decision_memories` with an influence type, summary, retrieval reference where available, and counterfactual action.

## D-007 — Run A / Run B is a controlled causal proof

**Status:** ACCEPTED

Control and treatment use comparable task/environment/constraints. The principal controlled difference is availability of prior operational memory. The claim is limited to observable behavioral change in this controlled system, not general human-like learning.

## D-008 — UNKNOWN remains first-class

**Status:** ACCEPTED

Missing memory infrastructure, inconclusive outcomes, unavailable retrieval, and unverified external integrations must remain explicitly UNKNOWN or unavailable. The system must not infer success from configuration alone.

## D-009 — Live verification artifacts are the authority for external integration claims

**Status:** ACCEPTED

A CockroachDB/AWS/MCP integration claim can be upgraded to `VERIFIED` only after the explicit live-verification workflow succeeds and emits the corresponding evidence artifact.

## D-010 — Recall exposure is fail-closed and persisted

**Status:** ACCEPTED

Retrieval candidates begin unexposed. The runtime applies expiry, compatibility, score, and evidence policy before marking a candidate exposed to the agent. Influence claims must reference a persisted exposed recall, so correctness does not depend on a warm Lambda process.

## D-011 — Memory policy is first-class, immutable by version, and frozen per execution

**Status:** ACCEPTED

Policy bundles are registered as immutable versions and assigned by explicit scope. The active bundle is resolved when an execution starts and its version is persisted on that execution. Later activation or retirement cannot silently change the rules of an in-flight execution.

## D-012 — Engram records decisions; it does not choose application actions

**Status:** ACCEPTED

The runtime validates memory provenance and influence eligibility but does not select the application's action. SDKs, HTTP, MCP, and framework adapters must not turn Engram into an autonomous planner or adjudicator.

## D-013 — ExecutionEpisode is the adapter boundary

**Status:** ACCEPTED

Framework integrations translate external execution state and telemetry into the versioned `ExecutionEpisode` schema. Framework-specific graph state, traces, or checkpoints are evidence inputs, not Engram operational memory and not automatic proof of memory influence.

## D-014 — One semantic runtime serves all integration surfaces

**Status:** ACCEPTED

TypeScript SDK, Python SDK, HTTP API, Engram MCP, and demo orchestration are transports or clients of the same runtime contract. They must not implement independent admission, retrieval, expiry, or influence rules.

## D-015 — Memory usefulness requires explicit evaluation evidence

**Status:** ACCEPTED

Retrieval frequency, later success, or correlation is insufficient to label a memory beneficial or harmful. Effect claims must be tied to an explicit method such as control run, shadow run, replay, or human assessment, with evidence state and provenance.

## D-016 — Conflict is an assessed relationship, not a vector-similarity inference

**Status:** ACCEPTED

Semantic proximity can nominate memories for review but cannot establish contradiction. Conflict/supersession/support relationships are stored only when an evaluation process supplies a rationale and evidence state.

## D-017 — Control plane begins read-only

**Status:** ACCEPTED

The initial control-plane API exposes agents, executions, memories, influences, policies, assignments, and evaluation dossiers. Policy mutation and evaluation writes remain outside the public HTTP surface until authentication, authorization, and audit semantics are explicit.

## D-018 — Production vector retrieval is agent-scoped and distance-matched

**Status:** ACCEPTED

Engram's production retrieval predicate is scoped by agent identity and ranks candidates with cosine distance (`<=>`). The production CockroachDB vector index therefore prefixes `agent_id` and uses `vector_cosine_ops`. Query success is not accepted as proof that C-SPANN served the query: live verification must capture a natural optimizer plan and separately report vector-distance retrieval and index selection.

## D-019 — Inspection surfaces fail closed

**Status:** SUPERSEDED by D-020

The initial hardening decision protected traces, control-plane reads, memory search, and MCP/provenance inspection behind a dedicated inspection token. D-020 broadens and simplifies that initial boundary.

## D-020 — All non-demo v1 API surfaces share one fail-closed bearer boundary

**Status:** ACCEPTED

For the initial deployable API, every `/v1/*` route except the deterministic public hackathon demo requires `ENGRAM_API_TOKEN`. `GET /health` remains public. This includes both operational reads and execution lifecycle mutations, so anonymous callers cannot inspect memory or create/modify arbitrary executions.

Missing server configuration returns `API_AUTH_NOT_CONFIGURED`; invalid or absent Bearer credentials return `UNAUTHORIZED` before database or MCP access. The TypeScript and Python HTTP SDKs expose first-class token options for private/server-side clients.

This single token is an MVP deployment guard, not production multi-tenant identity, tenancy, authorization, or RBAC. It must never be embedded in a public static frontend. Future actor-scoped identity may replace this boundary without changing Engram runtime semantics.

## D-021 — Exact retrieval identity is part of memory-to-action provenance

**Status:** ACCEPTED

When an execution performs multiple recalls, an influence must reference the exact retrieval that exposed the cited memory. Execution-level membership is insufficient. A valid memory ID paired with the wrong retrieval ID fails closed with `RETRIEVAL_MISMATCH`; Engram must not silently repair or substitute provenance.

## D-022 — Scenario policies remain outside the domain-neutral runtime

**Status:** ACCEPTED

Workload-specific action policies such as venue selection or software deployment strategy belong in scenario/application packages. They may consume recalled Operational Memory, but they do not become Engram runtime policy. This preserves the constitutional boundary that the application decides while Engram records and validates memory influence.

## D-023 — Frontend-consumable modules require explicit discovery and usage contracts

**Status:** ACCEPTED

Any module, endpoint, schema, SDK surface, read model, helper, or data contract intentionally consumable or reusable by a frontend must ship with an adjacent `frontend-usage/README.md` (or an adjacent `<artifact>-usage/README.md` for root-level artifacts) and an entry in `docs/frontend-modules/registry.json`.

The usage contract must state the consumption mode, canonical import/route, inputs/outputs, authentication and environment assumptions, a concrete example, semantic invariants, evidence status, implementation paths, and relevant tests.

Frontend discoverability is part of Definition of Done. A frontend team must not need to inspect implementation internals to discover whether a supported surface exists. Server-only modules are explicitly cataloged so absence from the frontend registry is not confused with absence from the system.

Repository conformance tests enforce the registry and guide requirements. `AGENTS.md` and `CONTRIBUTING.md` apply the same rule to automated agents and human contributors.

## D-024 — Recall-to-influence provenance is bound to memory state

**Status:** ACCEPTED

A memory ID and retrieval ID prove identity and exposure provenance, but they do not by themselves prove that the memory still has the same authority-relevant contents that were exposed. Every new recall exposure therefore persists a versioned digest of the Operational Memory state shown to the agent.

Before accepting a later influence, Engram reloads the memory and requires its current canonical state digest to equal the persisted recall binding. A changed state fails closed with `MEMORY_STATE_CHANGED_SINCE_RECALL`; a historical persisted recall that never captured a state binding remains readable but cannot support a new influence claim and fails with `RECALL_MEMORY_STATE_UNBOUND`.

The digest is provenance metadata, not proof that a memory is true, beneficial, current, or authorized. State continuity composes with exact retrieval identity, provenance authenticity, agent isolation, lifecycle eligibility, evidence-state limits, policy, contradiction, and counterfactual checks rather than replacing them.

The canonical digest namespace begins at `engram.memory-state/v1:sha256:<digest>`. Equivalent object key ordering must canonicalize identically so storage serialization differences do not manufacture false state changes.

## D-025 — Multi-source memory authority is bounded by every declared supporting source

**Status:** ACCEPTED

`sourceExecutionIds` is an evidence-support contract. Every declared source therefore contributes an upper bound to the evidence authority of a derived Operational Memory. A multi-source memory may not claim an evidence rank stronger than the weakest declared supporting source outcome.

The admitting execution remains bounded by D/EXP-017's direct admission ceiling. Additional historical sources are revalidated against their persisted outcome evidence; an unresolved historical outcome fails closed. Adding one strong source cannot elevate a memory whose declared support still depends on weaker evidence.

This decision does not assign weights or distinguish contextual from materially supporting sources. If Engram later needs non-material provenance citations, that requires an explicit source-role contract rather than weakening this invariant.
