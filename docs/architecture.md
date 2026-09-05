# Engram Architecture

Engram is execution-memory infrastructure for autonomous systems: a runtime, protocol, persistence model, integration surface, and control plane for preserving operational experience and proving when that experience influenced later action.

## Constitutional boundary

The application or agent remains the decision authority.

Engram may:

- preserve execution evidence;
- derive operational memory with source provenance;
- retrieve comparable prior experience;
- govern whether memory is eligible for exposure or influence;
- record the application's declared memory influence;
- preserve counterfactual/control evidence;
- observe outcomes and evaluate memory effects.

Engram does **not** choose the application's business action.

## System layers

```text
Control Plane
  executions · memories · policies · evaluations
        |
Integration Surfaces
  TypeScript SDK · Python SDK · HTTP API · Engram MCP · adapters
        |
Engram Runtime
  lifecycle · recall · admission · eligibility · influence · provenance
        |
Execution Model
  episodes · decisions · observations · outcomes · counterfactuals
        |
Evidence + Storage
  CockroachDB · VECTOR/C-SPANN · runtime evaluations · lineage
        |
External Integrations
  Amazon Bedrock · CockroachDB Cloud Managed MCP
```

## Canonical lifecycle

```text
context -> recall -> application decides -> authorize -> execute
        -> observe -> recover -> remember
```

`recall` and `influence` are separate events. A memory being retrieved does not prove that it changed a decision.

## Execution Episode

`engram.execution-episode/v1` is the portable execution representation used across adapters. It preserves execution identity, intent, context, constraints, decisions, observations, outcome, environment/tool/policy versions, and provenance.

Framework adapters translate external execution telemetry into this representation. They do not define independent memory semantics.

## Operational Memory

Operational Memory is derived from execution evidence and remains linked to its source execution(s). It is not rewritten as objective truth.

Admission is policy controlled. Candidate admission signals include unexpected failure, successful recovery, policy violation, human correction, safety intervention, significant cost, novel condition, and repeated pattern.

Contradictory memories coexist. Relationships such as `CONTRADICTS`, `QUALIFIES`, and `SUPERSEDES` are explicit assessed evidence rather than inferred from vector similarity alone.

## Recall and influence

A runtime recall records:

- retrieval identity;
- query and policy version;
- candidate ranking;
- which candidates were actually exposed;
- which candidates were rejected and why.

A decision influence must reference the actual memory and, when retrieval provenance is available, the exact retrieval that exposed it. A valid memory paired with the wrong retrieval is rejected.

Influence classes are:

- `CHANGED_ACTION`
- `CONSTRAINED_ACTION`
- `SUPPORTED_ACTION`
- `CONSIDERED`

`CHANGED_ACTION` requires a sourced counterfactual. Controlled executions are preferred over invented baselines.

## Policy model

Memory policy is versioned and first-class:

- Admission Policy
- Retrieval Policy
- Influence Policy
- Expiry/Invalidation Policy

A resolved policy bundle is frozen onto an execution at start. Activating a newer bundle does not silently rewrite the rules governing an in-flight execution.

An optional `MemoryEligibilityAdvisor` can add workload/evaluation-aware eligibility reasons without moving workload decision logic into the runtime. For example, a safety-sensitive workload may keep contradictory memories recall-visible while failing closed on unresolved contradiction at influence time.

## Stateless runtime and serverless execution

Runtime correctness does not depend on process-local state. Execution state, recalls, exposure state, decisions, outcomes, and evaluation events are reloadable from the store, allowing later Lambda invocations to continue the same execution after a cold start.

The AWS deployment shape is:

```text
Agent / SDK / Operator
        |
API Gateway
        |
AWS Lambda — Engram API + Runtime
        |
CockroachDB Cloud
   |             |
VECTOR       Managed MCP
        |
Amazon Bedrock Titan Embeddings
```

CockroachDB is the durable operational-memory substrate. Engram uses a normal PostgreSQL-compatible application connection for transactional hot-path reads/writes. CockroachDB Cloud Managed MCP is a separate read/introspection/provenance plane.

## Vector retrieval

Production retrieval is agent-scoped and cosine based. The canonical index is:

```text
memories_agent_embedding_cosine_idx
(agent_id, embedding vector_cosine_ops)
```

Successful vector-distance retrieval is not evidence that C-SPANN was selected. The live verifier captures a natural `EXPLAIN` plan for the exact Run B query and only promotes index-use evidence when the optimizer actually selects the expected vector index.

## Evaluation

Engram does not call memory beneficial merely because a later execution succeeded. Evaluations preserve explicit methods such as control run, shadow run, replay, or human assessment.

The intelligence layer tracks evidence such as:

- retrieval and exposure;
- influence and action change;
- beneficial/harmful assessed effects;
- stale-memory influence;
- recovery reuse;
- contradiction relationships;
- controlled experiment outcomes.

## Security boundaries

`GET /health` and `POST /v1/demo/run` are intentionally public in the MVP deployment.

Every other `/v1/*` route is protected by `ENGRAM_API_TOKEN`. The API fails closed if that server-side token is not configured. This is an MVP deployment guard, not production multi-tenant RBAC, and the token must not be shipped in a public static frontend.

Agent identity is part of retrieval isolation. Secret material must never be stored in semantic memory, execution events, decisions, or evidence artifacts.

## Evidence classification

Engram keeps implementation evidence separate from live integration evidence.

- deterministic workload execution may be `SIMULATED`;
- repository behavior can be `TESTED` through CI;
- external CockroachDB, Bedrock, MCP, C-SPANN selection, and AWS deployment remain `UNVERIFIED` until their credentialed workflows succeed;
- a successful external verifier artifact may promote only the boundaries it actually exercised.

See `evidence/claims.yaml`, `experiments/README.md`, and `docs/deployment.md` for the current evidence ledger, acceptance experiments, and live-verification path.
