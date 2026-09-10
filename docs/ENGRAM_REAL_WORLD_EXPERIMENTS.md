# Engram: Real-World Experiments in Plain English

This document explains the experiments in ordinary language.

It is written for someone who wants to understand what Engram does, what problem it solves, how an experiment unfolds, and what the results actually prove.

## The simple idea

An agent can make a mistake while doing a job. A normal system may record that mistake, but recording it is not enough. The useful question is:

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
