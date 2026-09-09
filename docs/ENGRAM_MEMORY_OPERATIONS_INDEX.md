# Engram Critical Memory Operations Index

Use this index to inspect the full memory lifecycle without searching the repository.

| Operation | Source | Function / symbol | Evidence |
|---|---|---|---|
| Start and complete execution | `packages/runtime/src/runtime.ts` | `EngramRuntime.startExecution`, `observe`, `complete` | runtime execution trace |
| Form Episode | `packages/experience/src/episode.ts` | `formExecutionEpisode` | `ExecutionEpisode` |
| Form ExecutionSlice | `packages/experience/src/execution-slice.ts` | `formExecutionSlice` | scoped execution fields |
| Form Experience | `packages/experience/src/experience.ts` | `formExperience` | interpretation and applicability |
| Form CandidateMemory | `packages/experience/src/formation.ts` | `formCandidateMemory` | candidate lineage |
| Admit memory | `packages/experience/src/formation.ts` | `admitCandidateMemory` | `ADMITTED` or `REJECTED` |
| Create ExecutionMemory | `packages/experience/src/formation.ts` | `formExecutionMemory` | versioned durable memory |
| Sibyl write | `packages/sibyl/src/behavioral-store.ts` | `persistEpisode`, `persistExecutionSlice`, `persistExperience`, `persistCandidateMemory`, `persistExecutionMemory` | durable behavioral graph |
| Sibyl read | `packages/sibyl/src/behavioral-store.ts` | `getExecutionMemory`, `loadBehavioralMemoryGraph` | fresh-process reconstruction |
| Materialize MemorySlice | `packages/experience/src/formation.ts` | `materializeMemorySlice` | scoped claims and redacted fields |
| Materialize InfluenceGrant | `packages/experience/src/formation.ts` | `materializeInfluenceGrant` | allowed and denied effects |
| Validate influence | `packages/runtime/src/agent-decision.ts` | `assertBehavioralProposalAuthorizedByGrant` | authorized or rejected proposal |
| Evaluate consequence | `packages/evaluation/src/memory-evaluation.ts` | `BehavioralMemoryEvaluationSchema` | effect and outcome record |
| Apply memory update | `packages/evaluation/src/memory-lifecycle.ts` | `applyMemoryUpdate` | immutable prior and new version |
| Persist memory update | `packages/sibyl/src/behavioral-store.ts` | `persistBehavioralEvaluation`, `persistMemoryUpdate`, `persistExecutionMemory` | update lineage |
| Read current eligibility | `packages/evaluation/src/memory-lifecycle.ts` | `isCurrentMemoryEligible` | obsolete versions fail closed |
| Agent boundary | `packages/agent-surface/src/server.ts` | `createAgentSurface` | bounded MCP lifecycle |
| Typed developer boundary | `packages/agent-surface/src/sdk.ts` | `EngramClient` | typed SDK lifecycle |

## Reviewer commands

```bash
npm run proof:judge
npm run demo:fresh-session
npm run demo:engram
npm run agent-surface:mcp
```

Judge-proof receipt:

```text
evidence/canonical/judge/latest/proof.json
```

Fresh-session receipt:

```text
evidence/canonical/judge/latest/fresh-session.json
```

The judge proof uses an isolated empty Sibyl backing store for its deletion arm. It does not delete canonical evidence or the real configured Sibyl database.
