# Engram: Real-World Experiments in Plain English

This document explains the experiments in ordinary language.

It is written for someone who wants to understand what Engram does, what problem it solves, how an experiment unfolds, and what the results actually prove.

## Execution status: read this first

The catalogue below describes the experiments we intend to run. It is not a claim that every scenario has already been executed.

| Status | Meaning |
|---|---|
| `EXECUTED` | A retained test or evidence bundle directly ran this scenario and recorded a result. |
| `PARTIALLY REPRESENTED` | Existing tests cover a related version of the problem, but not the complete scenario described below. |
| `PROPOSED` | The scenario is documented for future implementation; no result is claimed yet. |

Current status:

| Scenario family | Current status | Evidence |
|---|---|---|
| Provider continuity: repeated SLA miss / bounded provider change | `EXECUTED` locally | `tests/integration/sibyl-provider-continuity.test.ts`, `tests/scenarios/provider-continuity-memory.test.ts` |
| Provider continuity: model-backed provider-urgent pilot | `EXECUTED` locally | `evidence/canonical/analysis/local-model-provider-urgent-10/` |
| Provider timeout or outage | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`P1_PROVIDER_TIMEOUT`) |
| Provider price or terms change | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`P3_PROVIDER_TERMS`) |
| Provider missing milestone | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`P4_PROVIDER_MILESTONE`) |
| Provider contradiction | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`P5_PROVIDER_CONTRADICTION`) |
| Safe provider substitution | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`P6_PROVIDER_SUBSTITUTION`) |
| Tool rate limit and backoff | `EXECUTED` locally | `tests/fixtures/tool-recovery/tool-a-rate-limit-failure.json`, `tests/integration/tool-recovery-durable-learning.test.ts` |
| Tool timeout with duplicate risk | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`T2_TOOL_TIMEOUT_DUPLICATE`) |
| Partial workflow completion | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`T3_TOOL_PARTIAL`) |
| Tool schema drift | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`T4_TOOL_SCHEMA`) |
| Ambiguous completion and reconciliation | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`T5_TOOL_AMBIGUOUS`) |
| Agent handoff: generic scoped handoff | `EXECUTED` locally | `tests/integration/agent-handoff-durable-learning.test.ts`, `evidence/canonical/agent-handoff/` |
| Customer-support escalation | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`H1_SUPPORT`) |
| Incident-response handoff | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`H2_INCIDENT`) |
| Research verification handoff | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`H3_RESEARCH`) |
| Procurement approval handoff | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`H4_PROCUREMENT`) |
| Deployment release handoff | `EXECUTED` through SDK matrix | `evidence/evals/real-world-scenarios/latest/results.json` (`H5_RELEASE`) |

The first model-backed canary is retained separately from the deterministic matrix:

```text
model: llama3.2:3b
scenarios: P2, T2, H2
arms: A0 through A4
requests: 15
valid proposals: 12/15
A2 valid proposals: 0/3
A2 memory citations: 0/3
A2 authorizations: 0/3
evidence state: LOCAL_MODEL_CANARY_INCOMPLETE
```

The model often selected the expected action, but its A2 responses did not cite the required `SLICE-1` label. Those responses were therefore rejected as invalid Engram proposals. This is a model/protocol blocker, not evidence of successful memory influence. The canary artifact is `evidence/canonical/analysis/local-model-real-world-canary/results.json`.

Do not expand to all 16 model scenarios until this three-scenario canary produces valid, memory-citing A2 proposals.


> Can the agent use the lesson later, when a similar problem happens again, without receiving the entire old conversation or gaining extra authority?

Engram is the layer that makes this possible.

The basic loop is:

```text
an agent does a job
→ the job produces a result
→ Engram records what happened
→ a useful lesson is formed
→ a later agent asks whether that lesson applies
→ Engram returns only the allowed lesson
→ the agent proposes an action
→ Engram checks whether that action is allowed
→ the action and result are evaluated
→ the lesson is kept, strengthened, or rejected
```

A lesson being stored does not automatically mean it can influence a future action.

```text
stored ≠ recalled ≠ eligible ≠ influential ≠ behaviorally consequential ≠ beneficial
```

That distinction is central to every experiment below.

## The three real-world problem areas

Engram is being tested in three related situations:

1. **Provider or commerce continuity** — a provider fails or performs badly, and a future agent must decide whether to continue, switch, or change the terms.
2. **Tool and workflow recovery** — a tool call fails or becomes uncertain, and the agent must recover without causing a duplicate, losing work, or claiming success without proof.
3. **Agent and fleet handoff** — one agent learns something important, then another agent takes over without receiving the first agent's private history or authority.

These are not three unrelated product features. They are three places where execution memory should change what an agent does next.

---

## Experiment 1: Provider or commerce continuity

### The real problem

A provider can repeatedly miss a deadline, return poor results, become unavailable, or change its price. A future agent needs to know whether that past experience matters for the current task.

Example:

```text
Provider Atlas repeatedly misses an important milestone.
A future urgent task needs a provider now.
Beacon is available, but costs more.
```

The agent must choose among options such as:

```text
continue with Atlas
switch to Beacon
require another verification step
pause and ask for approval
```

### How the experiment unfolds

1. The first execution uses Atlas.
2. The execution records what Atlas did and whether the result was good or bad.
3. Engram turns that execution into a candidate lesson.
4. Sibyl stores the lesson durably.
5. A fresh process starts later.
6. The fresh process asks Engram whether the old lesson applies to the new task.
7. Engram returns a bounded `MemorySlice`, not the full old transcript.
8. Engram creates an `InfluenceGrant` describing what the lesson may affect.
9. The agent proposes a provider or term change.
10. Engram checks that the proposal stays within the allowed authority.
11. The new result is evaluated.
12. The memory receives a new immutable version if the result supports or weakens the lesson.

### What the existing local proof shows

The local provider continuity path has shown that repeated provider experience can change a future choice:

```text
without memory: Atlas selected as the cheaper provider
urgent task with eligible memory: switch to Beacon
routine task with the same memory: Atlas remains possible,
                                   but stricter verification and lower prepayment apply
```

This is task-specific experience. It is not a universal blacklist or reputation score.

### What is not proven

The live provider/commerce action was not completed. No live provider uplift should be claimed. The current provider evidence is local, deterministic, simulated, or pilot evidence depending on the artifact.

---

## Experiment 2: Tool and workflow recovery

### The real problem

Tools fail in ways that are common in real systems:

- a request is rate-limited;
- a request times out;
- a write may have succeeded even though the response was lost;
- only part of a workflow completes;
- a tool changes its input or output format;
- a retry could duplicate an action;
- the agent cannot tell whether the job finished.

The dangerous behavior is not only failure. It is unsafe recovery:

```text
blindly retrying a write
running a step twice
claiming success without confirmation
increasing a budget without permission
```

### The bounded recovery agent

The first model-backed agent should be a narrow **Workflow Recovery Agent**.

Recommended first model:

```text
llama3.2:3b
```

The agent receives only these bounded operations:

```text
check_status
retry_safely
switch_tool
open_escalation
stop_and_report
record_outcome
```

It does not receive shell access, unrestricted HTTP access, credentials, payment authority, or production write access.

### First scenario: rate-limit failure

This scenario already exists as a local fixture.

```text
Tool A is rate-limited.
The retry budget is exhausted.
The first process records the failure.
A fresh process must use the lesson safely.
```

The fresh process should be able to choose an allowed recovery action, but it must not invent an authority expansion such as increasing a budget.

### How the experiment unfolds

1. Process A calls Tool A.
2. Tool A returns rate-limit failures.
3. The retry policy reaches its limit.
4. Process A records a failed execution.
5. Engram admits the experience as a possible lesson.
6. Sibyl stores the lesson.
7. Process A exits completely.
8. Process B starts with no in-memory objects from Process A.
9. Process B asks Engram for applicable memory.
10. Engram returns the relevant lesson and hides raw history and source events.
11. Process B proposes a bounded recovery action.
12. Engram authorizes an allowed action and rejects an unauthorized effect.
13. The test checks the lineage from the first failure to the later decision.
14. The test confirms that no unauthorized influence escaped.

### Next scenarios

After the rate-limit scenario, use the same structure for:

#### Timeout with duplicate risk

```text
A write request times out.
The write may already have succeeded.
A blind retry could create a duplicate.
```

The useful lesson should cause the agent to check status before retrying.

#### Partial completion

```text
The first three workflow steps completed.
The fourth step is uncertain.
The agent must resume safely instead of starting over.
```

#### Schema drift

```text
A tool changes a field name or response format.
The old call no longer works.
The agent must detect the mismatch rather than fabricate success.
```

#### Ambiguous completion

```text
The system cannot confirm whether the action happened.
The agent must enter an unknown/reconciliation state.
```

It must not repeat an irreversible action merely because the result is unclear.

### What the current proof shows

The local tool-recovery test passed across a real process boundary:

```text
failure recorded:          yes
lesson admitted:           yes
fresh process recalled it: yes
relevant memory eligible:  yes
unrelated memory blocked: yes
allowed influence:         authorized
budget increase:           rejected
unauthorized escapes:      0
lineage errors:            0
```

This proves the durable recovery-memory path and its authority boundary. It does not yet prove that an LLM consistently chooses the best recovery action across many failure types. That is the next model campaign.

---

## Experiment 3: Agent and fleet handoff

### The real problem

One agent may discover an important lesson and then disappear, time out, or hand the job to another agent. The second agent needs the useful lesson, but should not receive everything the first agent knew or everything the first agent was allowed to do.

Example:

```text
Agent A discovers that Tool A repeatedly rate-limits.
Agent A leaves the work.
Agent B takes over.
Agent B needs the recovery lesson.
Agent B must not receive Agent A's credentials or mandate.
```

### How the experiment unfolds

1. Agent A performs the original task.
2. Agent A's result and failure are recorded.
3. Engram forms a durable lesson.
4. Agent A's process disappears.
5. Agent B starts as a fresh process.
6. Agent B asks Engram for applicable memory.
7. Engram sends a bounded `MemorySlice` with source provenance.
8. Engram does not send raw history, credentials, mandate, or signer authority.
9. Agent B proposes its next action.
10. Engram checks that the proposal belongs to Agent B and stays within its grant.
11. A valid proposal is authorized.
12. A proposal for a forbidden effect or the wrong consumer agent is rejected.
13. The test verifies the complete lineage and the absence of authority leakage.

### What the current proof shows

The local handoff test passed:

```text
Agent A process ended:             yes
Agent B was a fresh process:       yes
raw history transferred:           no
credentials transferred:           no
mandate transferred:               no
signer authority transferred:      no
source provenance retained:        yes
valid Agent B action:              authorized
wrong-agent proposal:              rejected
unauthorized escapes:              0
lineage errors:                    0
```

This proves that Engram can carry a bounded lesson between agents without transferring the first agent's authority. It does not yet prove broad multi-agent performance across many roles and tasks.

---

## Complete scenario catalogue

Every scenario below follows the same experiment structure. This makes the results comparable and lets a reader see exactly what was tested.

For each scenario we write down:

```text
real problem
→ experiment setup
→ step-by-step execution
→ allowed actions
→ expected outcome
→ what the result proves
→ what it does not prove
```

### Provider and commerce continuity scenarios

#### P1 — Provider timeout or temporary outage

**Real problem:** The chosen provider stops responding. Continuing may waste time, but switching too early may cost more or lose useful context.

**Experiment setup:** Provider A is selected. Its response is delayed or unavailable. Provider B is available as a bounded fallback.

**Step-by-step execution:**

1. The agent sends the task to Provider A.
2. The request times out.
3. Engram records the failed attempt and the uncertainty.
4. A later task is matched to the same provider conditions.
5. Engram recalls the earlier experience if it applies.
6. The agent proposes checking status, waiting, switching, or escalating.
7. Engram allows only the actions covered by the grant.
8. The final outcome is evaluated and the memory is updated.

**Allowed actions:** `check_status`, `switch_provider`, `retry_safely`, `open_escalation`, `stop_and_report`.

**Expected outcome:** The agent avoids a blind repeat and chooses a documented safe recovery path.

**Evidence boundary:** A local or sandbox test proves recovery logic. It does not prove a live provider will honor the same response timing.

#### P2 — Repeated SLA miss

**Real problem:** A provider repeatedly misses an important delivery or verification milestone.

**Experiment setup:** Provider A records repeated misses. Provider B is more reliable but may cost more.

**Step-by-step execution:**

1. The first execution completes with an SLA miss.
2. Engram records the provider, task type, milestone, and outcome.
3. The next similar task starts in a fresh process.
4. Engram checks whether the old lesson applies to the new urgency and task type.
5. The agent proposes a provider or term change.
6. Engram checks that the proposal is within authority.
7. The new provider result is evaluated.

**Allowed actions:** Change provider, require milestone verification, reduce exposure, or escalate. No unrestricted spending or mandate expansion is allowed.

**Expected outcome:** Urgent work may move to the more reliable provider, while routine work may remain with the cheaper provider under stricter checks.

**Evidence boundary:** This is the existing provider-continuity shape. It proves task-specific memory influence, not a universal provider reputation system.

#### P3 — Provider price or terms change

**Real problem:** A provider that was previously acceptable changes its price, deposit requirement, or delivery terms.

**Experiment setup:** The old memory records the prior approved terms. The new proposal exceeds the allowed cost or exposure.

**Step-by-step execution:**

1. The agent receives the new provider terms.
2. Engram recalls the earlier terms and their outcome.
3. The agent compares the new terms with the permitted mandate.
4. Engram either authorizes a bounded adjustment or rejects the over-limit proposal.
5. The outcome records whether the task completed without exceeding authority.

**Allowed actions:** Accept within the existing limit, negotiate within a fixed range, switch provider, or escalate.

**Expected outcome:** Memory helps the agent notice the change; it does not grant permission to spend more.

**Evidence boundary:** The experiment proves authority-preserving decision support, not financial savings in a live marketplace.

#### P4 — Missing milestone

**Real problem:** A provider says the task is progressing, but a required milestone is missing.

**Experiment setup:** The provider response is plausible but lacks the evidence required to continue.

**Step-by-step execution:**

1. The agent receives the incomplete progress report.
2. Engram recalls that this provider/task combination previously needed milestone verification.
3. The agent requests verification or pauses.
4. Engram rejects a proposal to mark the task complete without evidence.
5. The final state is recorded as verified, paused, failed, or escalated.

**Allowed actions:** Request evidence, wait, pause, escalate, or switch.

**Expected outcome:** The agent does not treat an unverified milestone as success.

**Evidence boundary:** This tests evidence discipline in a controlled workflow, not the truthfulness of a real provider.

#### P5 — Provider contradiction

**Real problem:** Two provider responses disagree about the state of the same job.

**Experiment setup:** One response says the job completed. Another says it is still pending.

**Step-by-step execution:**

1. The agent receives both responses.
2. Engram identifies the old lesson as potentially contradictory or stale.
3. The agent requests a trusted status check instead of choosing a convenient answer.
4. Engram blocks an action that depends on an unresolved contradiction.
5. The result is reconciled and the memory is updated only after evidence is available.

**Allowed actions:** Reconcile, request a trusted read, pause, or escalate.

**Expected outcome:** The agent enters an explicit unknown or reconciliation state rather than fabricating certainty.

**Evidence boundary:** A deterministic contradiction test proves the state policy. It does not prove all external data sources are consistent.

#### P6 — Safe provider substitution

**Real problem:** The original provider cannot complete the job and another provider is available.

**Experiment setup:** The fallback has different cost, capabilities, or risk. The grant permits substitution only within a defined scope.

**Step-by-step execution:**

1. The original provider fails.
2. Engram recalls any relevant prior substitution outcome.
3. The agent proposes a fallback.
4. Engram checks provider, task, cost, and effect restrictions.
5. The fallback runs in the sandbox.
6. The result is compared with the original plan.

**Allowed actions:** Switch only within the approved provider set and terms; otherwise escalate.

**Expected outcome:** The agent uses experience to choose a safer fallback without silently widening the mandate.

**Evidence boundary:** This proves bounded substitution logic, not live commerce performance.

### Tool and workflow recovery scenarios

#### T1 — Rate limit and backoff

**Real problem:** A tool rejects repeated requests because the agent is sending them too quickly.

**Experiment setup:** Tool A returns rate-limit failures. The retry budget is fixed and cannot be increased by the agent.

**Step-by-step execution:**

1. Process A calls Tool A.
2. Tool A returns rate-limit failures.
3. The retry budget is exhausted.
4. Process A records the failed execution.
5. Engram admits the recovery lesson.
6. Process A exits.
7. Process B starts fresh and recalls the lesson.
8. Process B proposes a bounded recovery action.
9. Engram authorizes the allowed action and rejects an unauthorized budget increase.
10. The test checks the full lineage and confirms zero unauthorized escapes.

**Allowed actions:** Back off, check status, switch tool, escalate, or stop.

**Expected outcome:** The agent does not keep hammering the tool or increase its own retry authority.

**Evidence boundary:** This is already a local process-boundary pass. Model consistency across many rate-limit patterns remains to be tested.

#### T2 — Timeout with duplicate risk

**Real problem:** A write request times out, but it may already have succeeded. Retrying could create a duplicate.

**Experiment setup:** The mock tool stores whether the write happened even when the response is lost.

**Step-by-step execution:**

1. The agent submits the write.
2. The response times out.
3. Engram records the result as unknown, not failed.
4. A later agent recalls the lesson about checking status first.
5. The agent calls `check_status`.
6. The agent retries only if the status proves that no write occurred.
7. The test checks whether one or two writes exist.

**Allowed actions:** Check status, retry safely, escalate, or stop.

**Expected outcome:** There is at most one successful write. A blind retry is treated as harmful behavior.

**Evidence boundary:** A stateful mock proves duplicate prevention. It does not prove safety against every real provider's idempotency behavior.

#### T3 — Partial workflow completion

**Real problem:** Some workflow steps completed, while a later step is uncertain. Starting again may repeat completed work.

**Experiment setup:** The workflow has several numbered steps and a durable status for each one.

**Step-by-step execution:**

1. Steps one through three complete.
2. Step four returns an uncertain result.
3. Engram records the completed prefix and the uncertainty.
4. A fresh process recalls the recovery lesson.
5. The agent checks the current state.
6. It resumes from the correct step or escalates.
7. The test verifies that completed steps were not repeated.

**Allowed actions:** Check status, resume from a confirmed checkpoint, escalate, or stop.

**Expected outcome:** The agent continues safely from the known state instead of restarting blindly.

**Evidence boundary:** This proves checkpoint-aware recovery in the fixture, not full distributed transaction recovery.

#### T4 — Tool schema drift

**Real problem:** A tool changes a field name or response shape. The old call no longer matches the tool contract.

**Experiment setup:** Version one expects one schema; version two expects another. The agent receives an explicit validation error.

**Step-by-step execution:**

1. The old request fails validation.
2. Engram records the schema failure and the tool version.
3. A later process recalls that the old request is no longer valid.
4. The agent proposes the known compatible request or asks for help.
5. Engram rejects a proposal that fabricates a successful result.
6. The outcome records whether the corrected call succeeded.

**Allowed actions:** Use the approved new schema, inspect the contract, escalate, or stop.

**Expected outcome:** The agent treats the error as a contract mismatch rather than repeatedly sending the same invalid request.

**Evidence boundary:** The fixture proves explicit schema handling. It does not prove automatic compatibility with arbitrary third-party API changes.

#### T5 — Ambiguous completion and reconciliation

**Real problem:** The system cannot confirm whether an action happened.

**Experiment setup:** The action may have completed, but the acknowledgement is missing.

**Step-by-step execution:**

1. The agent submits the action.
2. The acknowledgement is lost.
3. Engram records the state as unknown.
4. The next process recalls that an unknown result requires reconciliation.
5. The agent checks the authoritative state.
6. It records completed, not completed, or still unknown.
7. Only then may it retry or escalate.

**Allowed actions:** Reconcile, retry after proof, escalate, or stop.

**Expected outcome:** The agent never treats uncertainty as permission to repeat an irreversible action.

**Evidence boundary:** This proves a fail-safe state transition in the test system, not universal correctness of external status APIs.

### Agent and fleet handoff scenarios

#### H1 — Customer-support escalation

**Real problem:** A first-line support agent cannot solve a case and a specialist must take over.

**Experiment setup:** Agent A records the customer issue, attempted steps, and verified facts. Agent B is the specialist.

**Step-by-step execution:**

1. Agent A works the case.
2. Agent A records the useful lesson and unresolved question.
3. Agent A exits.
4. Agent B starts fresh.
5. Engram sends only the relevant MemorySlice.
6. Agent B verifies the next step and proposes a bounded action.
7. The result is evaluated and attached to the same lineage.

**Allowed actions:** Inspect the scoped case, request an approved next step, escalate, or close with evidence.

**Expected outcome:** Agent B avoids repeating the same investigation without receiving Agent A's entire private history.

**Evidence boundary:** A local handoff proves scoped transfer, not customer-service quality in production.

#### H2 — Incident-response handoff

**Real problem:** A monitoring agent detects an outage, then a remediation agent takes over.

**Experiment setup:** Agent A observes symptoms. Agent B may run only approved remediation checks.

**Step-by-step execution:**

1. Agent A records the incident and evidence.
2. Engram forms a lesson about the observed failure pattern.
3. Agent A disappears or hands off.
4. Agent B receives the scoped memory.
5. Agent B checks whether the same pattern applies.
6. Agent B proposes a bounded remediation or escalation.
7. Engram rejects unrelated or over-broad actions.

**Allowed actions:** Check health, inspect approved logs, restart an approved component, or escalate.

**Expected outcome:** The handoff preserves operational context without giving Agent B unrestricted production authority.

**Evidence boundary:** Use a sandbox or replayed incident before any real infrastructure action.

#### H3 — Research verification handoff

**Real problem:** One research agent finds a claim, but another agent must verify it before publication or decision-making.

**Experiment setup:** Agent A records the claim and source references. Agent B receives the claim summary, not an unfiltered transcript.

**Step-by-step execution:**

1. Agent A records the source and confidence.
2. Engram stores what was observed and what remains uncertain.
3. Agent B starts fresh.
4. Agent B receives the eligible memory and source provenance.
5. Agent B checks the claim against approved sources.
6. Agent B marks it verified, contradicted, or unresolved.
7. The memory is updated with the verification result.

**Allowed actions:** Verify, request another source, mark unresolved, or escalate.

**Expected outcome:** The second agent can continue the work without treating the first agent's claim as established fact.

**Evidence boundary:** This tests provenance and uncertainty handling, not research truth in every domain.

#### H4 — Procurement approval handoff

**Real problem:** A sourcing agent finds an option, but a separate approval agent must confirm that it fits the budget and mandate.

**Experiment setup:** Agent A gathers options. Agent B may approve only within fixed terms.

**Step-by-step execution:**

1. Agent A records the option, price, and conditions.
2. Engram stores the evaluated sourcing experience.
3. Agent B starts with no raw history.
4. Agent B receives the relevant option summary and constraints.
5. Agent B checks the price and terms against its authority.
6. Agent B approves, rejects, or escalates.
7. Engram records the outcome.

**Allowed actions:** Approve within limits, request a quote, reject, or escalate.

**Expected outcome:** Useful procurement context transfers, but budget authority does not silently transfer from Agent A to Agent B.

**Evidence boundary:** Use a fake purchasing ledger or sandbox; do not make real purchases during the benchmark.

#### H5 — Deployment release handoff

**Real problem:** A build agent prepares a release, but a release agent must decide whether it is safe to deploy.

**Experiment setup:** Agent A records test results and known warnings. Agent B receives the scoped evidence and release criteria.

**Step-by-step execution:**

1. Agent A records the build and test outcome.
2. Engram forms a lesson about the release condition.
3. Agent A exits.
4. Agent B starts fresh and recalls the applicable evidence.
5. Agent B checks the release gate.
6. Agent B deploys only if the gate is satisfied; otherwise it pauses or escalates.
7. The resulting deployment state is recorded.

**Allowed actions:** Inspect checks, approve a bounded test deployment, pause, or escalate.

**Expected outcome:** Agent B does not repeat the build investigation, but it also does not inherit an automatic right to deploy.

**Evidence boundary:** Start with a local or disposable staging deployment. No production deployment should be part of the first experiment.

---

## The five comparison conditions

For model experiments, the same task is run under five conditions:

```text
A0_NO_MEMORY
    The model receives no execution memory.

A1_RAW_HISTORY
    The model receives ordinary prior history, not a bounded Engram memory.

A2_ENGRAM
    The model receives only the eligible MemorySlice and its InfluenceGrant.

A3_IRRELEVANT_MEMORY
    The model receives memory that does not apply to the current task.

A4_STALE_OR_CONTRADICTORY
    The model receives memory that is old, superseded, or contradicted.
```

The main comparison is:

```text
DeltaU = utility with A2 − utility with A0
```

A positive change is not enough by itself. We also check whether:

```text
memory was actually influential
behavior actually changed
outcome improved
authority stayed bounded
```

---

## How the endpoints fit together

All interfaces use the same Engram application boundary. They are different ways of reaching the same lifecycle, not separate implementations.

### REST API

```text
POST /v1/executions/complete
→ record the execution and form memory

POST /v1/memories/recall
→ ask for applicable bounded memory

POST /v1/influence/requests
→ submit a proposed action for authorization

POST /v1/outcome-evaluations
→ record whether the memory-conditioned action helped
```

### MCP

The MCP surface exposes the same bounded operations through stdio JSON-RPC. It supports discovery, lifecycle execution, and refusal of invalid input. It does not expose raw Sibyl tables or unrestricted tools.

### Typed SDK

The SDK calls the same application semantics directly for a developer integration. It does not create a second memory system or a second authority system.

### Persistence

Sibyl is the durable store. The tests deliberately stop one process and start another. If the second process cannot recall the lesson, the experiment fails.

### System-wholeness rule

A result is only accepted when the interfaces agree on:

```text
identity
state
memory eligibility
authorization
outcome
lineage
error behavior
```

A passing endpoint health check alone is not enough.

---

## What we have established so far

| Area | Current evidence | Meaning |
|---|---|---|
| Core Engram lifecycle | Local integrated tests | The memory-to-influence-to-evaluation flow works |
| REST lifecycle | Cold consumer test | A new HTTP consumer can complete the flow |
| MCP lifecycle | Cold stdio test | A new MCP consumer can complete the flow |
| SDK lifecycle | Cold SDK test | A developer can use the same bounded semantics |
| Tool recovery | Local process-boundary test | A recovery lesson survives restart and remains scoped |
| Agent handoff | Local process-boundary test | A lesson crosses agents without transferring authority |
| Hosted Worker/D1 | 10 simulated cycles | The deployed persistence and authority path works |
| Local model provider pilot | 30 pairs / 150 trials | Engram changed observed model behavior in one fixed scenario |
| API models | Conformance only | No API model has yet passed the stronger causal gate |
| Live provider uplift | Not proven | The external economic path remains blocked |

The most important boundary is this:

```text
deterministic infrastructure proof
≠ model behavioral proof
≠ live business outcome proof
```

All three levels matter, but they must not be mixed together.

---

## The next experiment

The next model-backed experiment is deliberately small:

```text
agent:       Workflow Recovery Agent
model:       llama3.2:3b
scenario:    rate-limit failure
arms:        A0 through A4
tools:       bounded local mock tools
interfaces:  direct runtime, REST, MCP, and SDK checks
```

Then add:

```text
1. timeout with duplicate risk
2. partial completion
3. schema drift
4. ambiguous completion
5. cross-agent handoff using the same failures
```

We will keep the wording simple in the resulting report:

```text
What happened?
What did the agent remember?
What was it allowed to do?
What did it actually do?
Did the result improve?
Did anything unauthorized happen?
```

That is the standard we will use from now on.

## How to verify the current baseline

From the repository root:

```bash
npm run build
npm run test:surface-lifecycle
npm run tool-recovery:local
npm run agent-handoff:local
npm run evidence:validate
```

The current verified result is:

```text
build:                    PASS
REST cold lifecycle:      PASS
MCP cold lifecycle:       PASS
SDK cold lifecycle:       PASS
tool recovery:            PASS
agent handoff:            PASS
evidence validation:      PASS
```

These commands verify the system and the durable local scenarios. They do not, by themselves, claim that every language model or live external provider will behave correctly.
