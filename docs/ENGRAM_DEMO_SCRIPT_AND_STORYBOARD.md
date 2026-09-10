# Engram Demo Script and Storyboard

**Target duration:** 2 minutes 35 seconds
**Format:** 16:9 product demo, 1440×900 capture
**Renderer:** Browser-native deterministic capture
**Status:** Script and storyboard only. No video rendered yet.

## Demo thesis

Engram gives autonomous agents durable execution memory. It turns completed work into structured experience that can be recalled by a later session, used only within a bounded influence grant, and evaluated into the next version of memory.

The film must show more than one provider switch. The provider example is the visual anchor, but the story must also show tool recovery, workflow continuity, cross-agent handoff, Sibyl persistence, explicit MCP recall, authorization boundaries, and outcome-based updates.

## Truth boundary

The demo is a deterministic replay of retained local evidence and product surfaces.

It must not imply:

- production reliability;
- live provider uplift;
- model-weight retraining;
- live purchases or deployments;
- verified Base or Virtuals partner-stack usage;
- hosted MCP or production D1 operation.

Visible status language:

```text
LOCAL · CONTROLLED REPLAY
RETAINED EVIDENCE · NO LIVE PROVIDER ACTION
MODEL-WEIGHT TRAINING · NONE
UNAUTHORIZED ESCAPES · 0
```

## Cast and visual vocabulary

### Agent sessions

- **Session A:** the originating execution. It observes work, records what happened, and ends.
- **Session B:** a genuinely fresh process. It has no in-memory Session A state and must request applicable memory.
- **Fleet handoff:** a later agent receives a scoped lesson rather than an entire transcript.

### Memory objects

Use cards that move through explicit states:

```text
Execution
→ Experience
→ CandidateMemory
→ ExecutionMemory · ADMITTED
→ MemorySlice · ELIGIBLE
→ InfluenceGrant · AUTHORIZED
→ OutcomeEvaluation · UPDATED
```

### Three canonical lanes

```text
PROVIDER CONTINUITY
TOOL / WORKFLOW RECOVERY
CROSS-AGENT / FLEET HANDOFF
```

### System surfaces

```text
MCP · active agent recall
SDK · typed application integration
REST / HTTP · language-independent boundary
Sibyl · durable memory substrate
```

## Full narration script

### 00:00 to 00:12 · Opening problem

**Visual**

Black screen. A single line appears:

```text
Agents can reason. Agents can act.
What survives between them?
```

The line separates into three quiet cards:

```text
PROVIDER FAILURE
TOOL RECOVERY
AGENT HANDOFF
```

A thin lime signal passes through the three cards, but each card fades before the signal reaches the next session.

**Narration**

> An agent can complete a task and still lose everything that task taught it. When the session ends, the next agent may forget the provider that failed, the recovery path that worked, or the work another agent already verified.

### 00:12 to 00:27 · What Engram is

**Visual**

The three cards converge into an Engram title card:

```text
ENGRAM
DURABLE EXECUTION MEMORY FOR AUTONOMOUS AGENTS
```

Below it, four words appear one at a time:

```text
OBSERVE · PERSIST · INFLUENCE · LEARN
```

The first word becomes a small node that begins the main lifecycle.

**Narration**

> Engram is the execution-memory layer for autonomous agents. It captures what happened, turns it into structured experience, lets a future session ask whether that experience applies, and keeps the influence bounded by the authority that already exists.

### 00:27 to 00:49 · The memory loop

**Visual**

A horizontal sequence of cards enters from left to right:

```text
01  EXECUTION
02  EXPERIENCE
03  MEMORY
04  RECALL
05  OUTCOME
```

Each card receives a small green state stamp. The cards do not appear all at once. Each one arrives, settles, and connects to the next with a thin line.

Under the cards, a compact caption resolves:

```text
completed work → reusable experience → next decision
```

**Narration**

> The loop is simple. A completed execution produces evidence. Engram forms that evidence into an experience and an admitted execution memory. A later session recalls only what is applicable, uses it inside a bounded grant, and sends the observed result back to Engram. The outcome can strengthen, weaken, supersede, or invalidate the memory.

### 00:49 to 01:10 · Sibyl persistence

**Visual**

The memory card descends into a dark storage plane labeled:

```text
SIBYL
DURABLE MEMORY SUBSTRATE
```

Typed object cards settle into the plane one by one:

```text
execution episode
execution slice
experience
candidate memory
execution memory
memory slice
influence grant
outcome evaluation
```

The storage plane remains visible while the Session A card moves away and disappears. The memory card remains.

A boundary marker appears:

```text
SESSION A ENDS
PROCESS STATE CLEARED
```

**Narration**

> Sibyl is Engram’s memory substrate. Engram persists a typed behavioral-memory graph instead of relying on a hidden prompt or a surviving in-memory object. That is what makes the boundary meaningful. Session A can end, its process state can clear, and the experience can still be reconstructed by a later session.

### 01:10 to 01:28 · Three things Engram carries forward

**Visual**

The storage plane expands into three lanes. Three large cards move across the screen in sequence.

#### Lane one

```text
PROVIDER CONTINUITY
Atlas missed the urgent SLA.
Lesson: compare future urgent work against that experience.
```

#### Lane two

```text
TOOL / WORKFLOW RECOVERY
A tool timed out or changed schema.
Lesson: retry, reconcile, or route through the verified recovery path.
```

#### Lane three

```text
CROSS-AGENT / FLEET HANDOFF
Another agent verified part of the workflow.
Lesson: continue scoped work without replaying the whole transcript.
```

Each card gets a small footer:

```text
CONTEXT · EVIDENCE · APPLICABILITY · LINEAGE
```

**Narration**

> Engram is not only a provider fallback. The same mechanism carries forward provider continuity, tool and workflow recovery, and cross-agent handoff. The reusable unit is not a vague reputation score. It is a scoped lesson with context, evidence, applicability, and lineage.

### 01:28 to 01:47 · Fresh Session B and active MCP recall

**Visual**

Session A slides off screen. A new card enters from the opposite side:

```text
SESSION B
FRESH PROCESS
NO SESSION A OBJECTS
```

The agent card pauses, then displays an outgoing MCP request:

```text
→ recall_applicable_memory
purpose: choose a safe provider for an urgent task
```

The request travels to the Engram runtime. A response card returns:

```text
MEMORYSLICE · ELIGIBLE
Use Beacon for urgent tasks.
source: prior execution evidence
```

A second card attaches beneath it:

```text
INFLUENCEGRANT
allowed effect: provider_selection
```

**Narration**

> Session B does not receive the old transcript automatically. The agent actively requests applicable memory through MCP. Engram filters the request and returns a bounded MemorySlice with its source and an InfluenceGrant that names what the memory may influence.

### 01:47 to 02:05 · A0 versus A2 decision change

**Visual**

Split screen with identical task inputs:

```text
SAME MODEL · SAME TASK · SAME BUDGET · SAME AVAILABLE ACTIONS
```

Left panel:

```text
A0 · WITHOUT ENGRAM MEMORY
Atlas · cheaper option
```

Right panel:

```text
A2 · WITH ACTIVE ENGRAM RECALL
MemorySlice cited
Beacon · bounded fallback
```

The two panels merge into one decision card:

```text
ATLAS → BEACON
BEHAVIOR CHANGED
```

A small label clarifies:

```text
provider selection only
```

**Narration**

> The causal comparison is visible here. Without Engram memory, the same model selects the cheaper Atlas option. With active recall, it cites the returned slice and selects Beacon for the urgent task. The change is strategic, not a new permission.

### 02:05 to 02:20 · Bounded influence

**Visual**

The InfluenceGrant expands into two columns.

Allowed card, lime border:

```text
ALLOWED
provider selection
tool selection
retry policy
timeout policy
fallback policy
```

Denied card, red-orange border:

```text
DENIED
increase budget
create signer
create wallet
create capability
expose raw history
```

The decision card moves through the allowed column and is blocked at the denied column by a firm vertical boundary.

**Narration**

> Memory can change an operational choice, but it cannot create authority. It may influence provider, tool, retry, timeout, fallback, or routing strategy when the grant allows it. It cannot increase a budget, create a signer or wallet, or expose unrestricted history.

### 02:20 to 02:35 · Outcome and memory update

**Visual**

The authorized Beacon decision becomes an outcome card:

```text
OUTCOME OBSERVED
urgent task completed within the controlled scenario
```

The card returns to the memory plane. The original memory card remains visible while a new version slides in:

```text
MEMORY VERSION
v1 → v2
OUTCOME EVALUATED
```

The three lanes briefly reappear behind it. Each lane receives a small green check, while the main proof receipt stays in front.

**Narration**

> Engram does not stop at recall. It evaluates what happened next and creates the next immutable memory version. That closes the loop from experience to behavior to learning across providers, tools, workflows, and agents.

### 02:35 to 02:50 · What we built and verified

**Visual**

A proof dashboard appears as a focused receipt, not a metric wall:

```text
ACTIVE MCP AGENT PROOF
llama3.2:3b
A0 → Atlas
A2 → Beacon
MCP recall requested · yes
MemorySlice · ELIGIBLE
InfluenceGrant · AUTHORIZED
Outcome · UPDATED
Unauthorized escapes · 0
```

Then three surface labels enter beneath it:

```text
SDK · 16/16
REST / HTTP · 16/16
MCP STDIO · 16/16
```

A footer label appears:

```text
LOCAL CONTROLLED EVIDENCE
```

**Narration**

> We built the same lifecycle across a typed SDK, REST and HTTP, and MCP stdio. The deterministic scenario matrix passed across provider continuity, tool recovery, and agent handoff. The strongest model-backed proof shows an active MCP recall, a changed decision, bounded authorization, and an updated memory.

### 02:50 to 03:00 · Closing

**Visual**

All cards collapse into one final statement:

```text
WHAT HAPPENED
BECOMES WHAT THE NEXT AGENT CAN USE
```

Below it:

```text
ENGRAM
DURABLE EXPERIENCE · BOUNDED INFLUENCE · OUTCOME UPDATES
```

Final disclaimer:

```text
RETAINED LOCAL PROOF · NO LIVE PROVIDER ACTION
```

**Narration**

> Engram gives agents continuity without giving them more power. What happened becomes something the next agent can use.

## Motion storyboard

| Time | Scene | Primary motion | State change | Proof object |
|---|---|---|---|---|
| 00:00–00:12 | The gap | Cards appear, fail to cross the session boundary | Experience disappears with the session | Three problem cards |
| 00:12–00:27 | Engram thesis | Cards converge into the Engram mark | Product category resolves | Engram title card |
| 00:27–00:49 | Memory loop | Lifecycle cards enter and connect one at a time | Execution becomes reusable memory | Five lifecycle cards |
| 00:49–01:10 | Sibyl | Typed cards settle into storage, Session A clears | Persistence survives process death | Sibyl storage plane |
| 01:10–01:28 | Three lanes | Provider, tool, and handoff cards travel through shared plane | One runtime supports three domains | Three domain cards |
| 01:28–01:47 | Fresh recall | Session B requests MCP memory, response returns | Recall is explicit and scoped | MCP request + MemorySlice + grant |
| 01:47–02:05 | A0/A2 | Identical inputs split, then merge | Decision changes from Atlas to Beacon | Causal comparison |
| 02:05–02:20 | Boundary | Allowed card passes, denied card stops | Influence remains bounded | Allowed/denied grant |
| 02:20–02:35 | Update | Outcome returns to memory plane, version slides in | Memory updates from outcome | v1 → v2 |
| 02:35–02:50 | Verification | Receipt fields stamp in sequence | Evidence states resolve | Active MCP proof |
| 02:50–03:00 | Close | All cards collapse into product statement | Story resolves without live claim | End card |

## Card-state animation rules

Every card must follow this state grammar:

```text
unobserved
→ observed
→ persisted
→ recalled
→ eligible
→ authorized or refused
→ outcome evaluated
→ updated, superseded, or invalidated
```

Cards should enter from a meaningful direction:

- execution cards enter from the left;
- persistent memory cards descend into Sibyl;
- fresh sessions enter from the right;
- MCP requests travel toward Engram;
- bounded grants return toward the agent;
- outcomes travel back to the memory plane;
- refused effects stop at the authority boundary.

Do not animate all cards simultaneously. Each state must settle before the next dependent state appears.

## Camera and composition

- Keep the main product surface centered with generous negative space.
- Use a left-to-right timeline for lifecycle progression.
- Use a vertical drop only for persistence into Sibyl.
- Use a split screen only for the A0 and A2 causal comparison.
- Push in on `recall_applicable_memory`, `MemorySlice · ELIGIBLE`, and `InfluenceGrant · AUTHORIZED`.
- Hold the final receipt long enough to read every state.
- Never use a camera move to hide a missing state or transition.

## Visual asset plan

Use the already-created product pages as visual references and capture surfaces:

```text
apps/demo/index.html       landing and product thesis
apps/demo/evidence.html    experiment cards and receipts
apps/demo/replay.html      fresh-session timeline
apps/demo/developers.html  SDK, MCP, REST onboarding
```

Use deterministic browser-native card reconstructions for the abstract transitions. Do not fabricate new provider results, transaction records, partner usage, or production metrics.

## Evidence labels required in film

```text
LOCAL CONTROLLED EVIDENCE
MODEL-CONDITIONED LOCAL PROOF
DETERMINISTIC MATRIX
NO LIVE PROVIDER ACTION
NO MODEL-WEIGHT TRAINING
BASE / VIRTUALS USAGE NOT CLAIMED
```

## Acceptance gates before rendering

- [ ] Script remains between 2 and 3 minutes at the chosen narration pace.
- [ ] All three canonical domains appear.
- [ ] Sibyl persistence is shown as a storage boundary, not as a generic database logo.
- [ ] Session B actively requests MCP recall.
- [ ] MemorySlice and InfluenceGrant are separate visible objects.
- [ ] A0 and A2 use the same task and model framing.
- [ ] Allowed and denied authority are both shown.
- [ ] Outcome evaluation produces a visible memory update.
- [ ] SDK, REST/HTTP, and MCP surfaces appear without implying separate runtimes.
- [ ] Local evidence and hosted/production limits are labeled.
- [ ] No raw Sibyl tables, credentials, unrestricted history, or fabricated live state appear.
- [ ] Motion changes semantic state, not only position or opacity.
- [ ] Every card settles before dependent cards appear.
- [ ] Final receipt is readable at normal speed.

## Proposed end state

The finished video should leave a judge with this understanding:

```text
Engram remembers executions, not just conversations.
Sibyl keeps the experience across process boundaries.
A fresh agent asks for applicable memory.
The returned memory is bounded by an InfluenceGrant.
The agent changes strategy without gaining authority.
The outcome updates what the next agent can use.
```
