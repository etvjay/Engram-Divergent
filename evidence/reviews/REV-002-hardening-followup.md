# REV-002 — Causal Spine Hardening Follow-up

Date: 2026-08-16
Baseline: REV-001
Repository checkpoint: last successful pre-billing Engram CI evidence remains authoritative for already-tested slices; post-auth/SAM changes are not promoted until GitHub Actions runners are available again.

## Purpose

This review records which REV-001 hardening gaps have been closed in implementation and which still require automated or credentialed external evidence. It does not retroactively rewrite REV-001.

## Closed implementation gaps

### A17 — API/control-plane exposure

**Status: IMPLEMENTED; post-change aggregate CI blocked by GitHub account billing.**

Engram now uses one fail-closed deployment boundary: `ENGRAM_API_TOKEN`.

Public surfaces are deliberately limited to:

- `GET /health`;
- `POST /v1/demo/run` for the deterministic hackathon proof.

Every other `/v1/*` operation requires the same Bearer token, including:

- execution lifecycle mutation (`start`, recall, decision recording, observation recording, completion);
- execution trace reads;
- low-level memory search;
- Managed MCP status/provenance reads;
- control-plane agents/executions/memories/influences/policies/evaluation reads.

Missing server configuration returns `API_AUTH_NOT_CONFIGURED`; missing/invalid Bearer credentials return `UNAUTHORIZED` before database/MCP access. SAM exposes `ApiToken` as a `NoEcho` parameter and maps it to `ENGRAM_API_TOKEN`. The TypeScript and Python HTTP SDKs expose first-class `apiToken` / `api_token` options.

Boundary: this is a single-token initial deployment guard, not production multi-tenant identity or RBAC. The token must not be embedded into a public static frontend. Policy mutation remains unexposed and still requires actor identity, authorization, immutable audit, and review semantics before production exposure.

### A18 — mismatched idempotent event and outcome replay

**Status: IMPLEMENTED; credentialed Cockroach execution pending.**

`CockroachMemoryRepository.appendEvent()` distinguishes:

- exact replay of the same event at an existing execution sequence: accepted as idempotent;
- different event content at the same execution sequence: rejected with `EVENT_IDEMPOTENCY_CONFLICT`.

`recordOutcome()` now applies the same invariant:

- exact replay is harmless;
- a second semantic outcome for the same execution is rejected with `OUTCOME_IDEMPOTENCY_CONFLICT` rather than rewriting history.

Atomic sequence allocation is separately implemented through `AtomicCockroachRuntimeStore` using a CockroachDB `UPDATE ... RETURNING` allocator.

Boundary: credentialed concurrent/idempotency CockroachDB evidence remains separate from repository compile/test conformance.

### A19 — trace reconstruction ambiguity

**Status: PASS at contract level; live Cockroach execution pending.**

The credential-gated Cockroach integration suite reconstructs:

- distinct recalls in one execution;
- distinct decisions;
- the same memory used through distinct retrievals;
- each decision-memory edge retaining the retrieval ID that actually exposed the memory.

Agent-isolation coverage also requires that one agent cannot retrieve another agent's memory even with an identical semantic query.

Live execution remains part of external verification.

### A20 — failed live proof leaves only logs

**Status: PASS in implementation.**

The canonical verifier writes `evidence/live/latest.json` on both success and failure. Failure evidence records:

- `LIVE_EXTERNAL_INTEGRATION_FAILED`;
- failure stage;
- sanitized error text;
- conservative `UNKNOWN` cloud/runtime boundaries;
- `SIMULATED` external workload boundary.

The canonical workflow uploads the evidence directory with `if: always()`.

## C-SPANN claim correction

Engram retrieval ranks with cosine distance. Forward migrations provide the canonical agent-scoped cosine vector index:

`memories_agent_embedding_cosine_idx (agent_id, embedding vector_cosine_ops)`

Superseded global vector indexes are retired after the scoped cosine index exists.

The live verifier explains the **exact persisted Run B retrieval query, filters, and candidate limit**. C-SPANN is promoted only if the natural optimizer plan selects the expected scoped cosine index through vector search. A successful vector-distance query alone is insufficient.

## Bedrock proof correction

The live artifact records the concrete embedding identity:

- provider (`AWS_BEDROCK`);
- model ID;
- AWS region;
- dimensions.

This prevents a successful run from ambiguously proving only that an unspecified embedding provider was invoked.

## New intelligence findings

### Bad memory

Adversarial tests establish:

`candidate retrieval != exposure != influence`

Stale/version-invalid memory can be rejected before exposure, while exposed low-confidence memory can still be rejected at influence time.

### Contradiction and harm

Contradiction, qualification, supersession, and harmful/beneficial effects remain append-only evidence. Vector similarity does not adjudicate conflict, and later success does not automatically establish usefulness.

### Competing eligible memories

EXP-004 has accepted an **opt-in** fail-closed influence profile for unresolved explicit contradiction in autonomous/safety-sensitive workloads:

- conflicting evidence remains visible at recall;
- unresolved explicit contradiction may block action authority at influence;
- this remains `MemoryEligibilityAdvisor` composition, not a universal protocol default.

## Deployment verification

Two reproducible workflows exist:

- `.github/workflows/live-verification.yml` — CockroachDB + Bedrock + Managed MCP causal/integration proof.
- `.github/workflows/aws-deploy-verification.yml` — SAM deploy, API URL resolution, public health/demo checks, unauthenticated `/v1` rejection, then authenticated trace/control-plane/evaluation/MCP checks with an evidence artifact.

A separate `.github/workflows/sam-build.yml` is intended to provide credential-free `sam validate` + `sam build` packaging verification.

### Current CI infrastructure boundary

Recent Actions jobs are currently not starting. GitHub records `runner_id: 0`, zero job steps, and the annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

Therefore, post-auth/SAM commits must remain **IMPLEMENTED / UNVERIFIED BY CI** until the account billing/spending issue is resolved and the workflows execute normally. This is an Actions-account infrastructure failure, not evidence that the Engram code or SAM template failed its commands.

## External evidence still required

The following remain deliberately unpromoted:

1. CockroachDB Cloud persistence under the canonical live workflow.
2. Natural C-SPANN selection of the agent-scoped cosine index.
3. Real AWS Bedrock Titan invocation using recorded provider metadata.
4. Managed MCP connection plus provenance `select_query` output.
5. Successful credential-free SAM validate/build after Actions runners resume.
6. Successful SAM deploy and deployed public/authenticated API exercise.
7. Credentialed concurrent sequence/idempotency/agent-isolation Cockroach tests.

## Current assessment

The dominant remaining risk has shifted from semantic architecture to **external verification, packaging/deployment execution, and identity-aware production hardening**. The runtime has explicit boundaries for recall exposure, influence, frozen policy, evaluation, contradiction handling, API authorization, idempotency, atomic sequencing, agent isolation, and failure evidence.

None of those should be promoted to live-cloud guarantees solely from repository implementation, especially while GitHub Actions is unable to allocate runners.
