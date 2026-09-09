# Engram Submission Video Script

Target duration: 2 to 5 minutes.

## 0:00–0:20 | Problem and thesis

Most memory systems help agents remember information.

Engram helps agents remember consequences.

An execution produces experience. That experience can influence a later execution, be evaluated against its outcome, and become a new immutable memory version.

## 0:20–1:20 | Tool recovery fresh-session proof

Tool A fails under high load and exhausts its retry policy.

Process A forms an Episode, ExecutionSlice, Experience, CandidateMemory, and admitted ExecutionMemory. The memory is written to Sibyl.

Process A exits.

Process B starts with a fresh runtime. It recalls the memory, checks applicability, materializes a MemorySlice, and receives an InfluenceGrant. The grant allows bounded tool selection and fallback effects. It denies budget increases, new wallets, new signers, and new capabilities.

The strategy changes to Tool B recovery.

The isolated Sibyl-absent arm finds no memory and returns to Tool A and failure. This is material functional degradation, not a claim that the executable crashes.

## 1:20–2:10 | Agent A to B to C

Agent A generates experience.

Agent B receives the scoped MemorySlice and InfluenceGrant. B does not receive raw history, credentials, mandate, or signer authority.

B's outcome evaluates the memory. The update creates a new immutable version.

Agent C starts fresh and receives the current version. Obsolete and invalidated versions do not influence future work.

Experience can become portable without authority becoming portable.

## 2:10–3:00 | Provider continuity boundary

Provider continuity is the external proof frontier.

The local deterministic provider benchmark and retained Qwen benchmark are shown first. The Qwen result is neutral, with DeltaU equal to zero across ten pairs.

An authentic ACP job was created for Hermes Data Provider on Base mainnet. Job history remains readable, but ACP session rehydration fails for the existing job. The maintained SDK returns no session and funding returns SESSION_NOT_FOUND.

No terminal provider result, U0, A2, U2, or live provider uplift is claimed.

## 3:00–3:35 | A0-A5 and authority

Show the A0-A5 utility chart.

A2 minus A0 is plus 1.90 local deterministic evidence.

A5 minus A2 is plus 0.02 local deterministic evidence.

Show the authority containment figure. Thirty unauthorized attempts were contained with zero escapes.

## 3:35–4:10 | Sibyl deletion test

Show the two proof arms.

With Sibyl enabled, the fresh process recalls memory, changes strategy, and succeeds through bounded recovery.

With an isolated empty Sibyl store, memory is absent and the same task returns to the no-memory Tool A failure baseline.

This proves that continuity is carried by durable Sibyl-backed experience rather than by the process or prompt alone.

## 4:10–4:30 | Boundary and close

Engram is locally proven for tool recovery, agent handoff, memory evaluation, authority containment, MCP, and the typed SDK.

The provider terminal path and model-backed extension remain externally blocked and are shown as such.

Agents repeatedly pay to learn the same execution lessons.

Engram turns those consequences into bounded experience that survives runtimes and agents.

Memory for what agents do.
