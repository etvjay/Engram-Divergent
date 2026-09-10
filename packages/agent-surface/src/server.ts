import { randomUUID } from "node:crypto";
import { ExecutionEventSchema, OutcomeSchema } from "../../memory-core/src/domain.js";
import { ExecutionMemorySchema } from "../../memory-core/src/execution-memory.js";
import { BehavioralMemoryEvaluationSchema } from "../../evaluation/src/memory-evaluation.js";
import { applyMemoryUpdate, isCurrentMemoryEligible } from "../../evaluation/src/memory-lifecycle.js";
import { assertBehavioralProposalAuthorizedByGrant, AgentDecisionProposalSchema } from "../../runtime/src/agent-decision.js";
import { formExecutionEpisode, formExecutionMemory, formExecutionSlice, formExperience, formCandidateMemory, admitCandidateMemory, materializeMemorySlice, materializeInfluenceGrant } from "../../experience/src/formation.js";
import type { BehavioralMemoryStore } from "../../experience/src/store.js";
import { createEvaluationQuerySurface } from "./evaluation-query.js";

export const AGENT_SURFACE_TOOLS = ["record_complete_execution", "recall_applicable_memory", "request_influence", "submit_outcome_evaluation", "get_evaluation_summary", "compare_arms", "get_memory_update_history", "get_authority_boundary_metrics", "get_use_case_scorecard", "get_evidence_receipt"] as const;
const SAFE_EFFECTS = ["provider_selection", "tool_selection", "retry_policy", "timeout_policy", "fallback_policy", "verification_policy"];

type JsonRpcRequest = { jsonrpc: "2.0"; id: string | number; method: string; params?: Record<string, unknown> };

export function createAgentSurface(store: BehavioralMemoryStore) {
  const query = createEvaluationQuerySurface();
  return {
    listTools: () => [
      ...AGENT_SURFACE_TOOLS.slice(0, 4).map((name) => ({ name, description: `Bounded Engram ${name}; raw Sibyl history is never returned.` })),
      ...query.listTools(),
    ],
    listResources: () => query.listResources(),
    async call(request: JsonRpcRequest): Promise<Record<string, unknown>> {
      const params = request.params ?? {};
      switch (request.method) {
        case "initialize": return { protocolVersion: "2026-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "engram-agent-surface", version: "0.2.0" } };
        case "tools/list": return { tools: this.listTools() };
        case "resources/list": return { resources: this.listResources().map((uri) => ({ uri })) };
        case "resources/read": return query.call("get_evaluation_summary");
        case "tools/call": {
          const name = String(params.name ?? "");
          return await this.call({ ...request, method: name, params: (params.arguments as Record<string, unknown> | undefined) ?? {} });
        }
        case "record_complete_execution": return recordCompleteExecution(store, params);
        case "recall_applicable_memory": return recallApplicableMemory(store, params);
        case "request_influence": return requestInfluence(store, params);
        case "submit_outcome_evaluation": return submitOutcomeEvaluation(store, params);
        case "get_evaluation_summary":
        case "compare_arms":
        case "get_memory_update_history":
        case "get_authority_boundary_metrics":
        case "get_use_case_scorecard":
        case "get_evidence_receipt": return query.call(request.method, params);
        default: throw new Error(`AGENT_SURFACE_METHOD_NOT_FOUND:${request.method}`);
      }
    },
  };
}

async function recordCompleteExecution(store: BehavioralMemoryStore, params: Record<string, unknown>) {
  const execution = params.execution as Record<string, unknown>;
  const events = Array.isArray(params.events) ? params.events.map((item) => ExecutionEventSchema.parse(item)) : [];
  const outcome = OutcomeSchema.parse(params.outcome);
  const evidenceRefs = Array.isArray(params.evidenceRefs) ? params.evidenceRefs.map(String) : [];
  const episode = formExecutionEpisode({ execution: { ...execution, startedAt: new Date(String(execution.startedAt)), completedAt: new Date(String(execution.completedAt)) } as never, events, outcome, evidenceRefs, evidenceState: outcome.evidenceState });
  const slice = formExecutionSlice({ episode, purpose: "agent_surface_record", subject: String(params.subject ?? episode.workflowType), fields: (params.fields as Record<string, unknown> | undefined) ?? {} });
  const experience = formExperience({ episode, slice, subject: slice.subject, observation: String(params.observation ?? outcome.summary), interpretation: String(params.interpretation ?? outcome.summary), applicability: (params.applicability as Record<string, unknown> | undefined) ?? episode.context, confidence: Number(params.confidence ?? 0.7) });
  const candidate = formCandidateMemory({ experience, memoryType: String(params.memoryType ?? "EXECUTION_EXPERIENCE"), summary: String(params.summary ?? experience.interpretation), proposedInfluence: SAFE_EFFECTS });
  const admission = admitCandidateMemory({ candidate, reason: "Agent surface bounded admission" });
  if (admission.status !== "ADMITTED") return { status: "REJECTED", reason: admission.reason, candidateMemoryId: candidate.id };
  const memory = formExecutionMemory({ candidate: admission.candidate });
  await store.persistEpisode(episode); await store.persistExecutionSlice(slice); await store.persistExperience(experience); await store.persistCandidateMemory(candidate); await store.persistExecutionMemory(memory);
  return { status: "ADMITTED", ids: { episodeId: episode.id, executionSliceId: slice.id, experienceId: experience.id, candidateMemoryId: candidate.id, executionMemoryId: memory.id } };
}

async function recallApplicableMemory(store: BehavioralMemoryStore, params: Record<string, unknown>) {
  const memoryId = String(params.executionMemoryId); const memory = await store.getExecutionMemory(memoryId);
  if (!memory) throw new Error("AGENT_SURFACE_MEMORY_NOT_FOUND");
  const versions = [memory];
  const context = (params.context as Record<string, unknown> | undefined) ?? {};
  const eligible = isCurrentMemoryEligible({ memory, versions, context });
  if (!eligible) return { status: "NO_ELIGIBLE_MEMORY", memoryId };
  const slice = materializeMemorySlice({ memory, consumerAgentId: String(params.consumerAgentId), consumerExecutionId: String(params.consumerExecutionId), purpose: String(params.purpose ?? "bounded_influence"), subject: String(params.subject ?? memory.memoryType), claims: [memory.summary], evidenceRefs: ["engram://execution-memory/" + memory.id] });
  const grant = materializeInfluenceGrant({ slice, allowedEffects: SAFE_EFFECTS, deniedEffects: ["increase_budget", "new_signer", "new_wallet", "new_asset", "new_capability"], constraints: { authority: "monotonic" } });
  await store.persistMemorySlice(slice); await store.persistInfluenceGrant(grant);
  return { status: "ELIGIBLE", memorySlice: slice, influenceGrant: grant };
}

async function requestInfluence(store: BehavioralMemoryStore, params: Record<string, unknown>) {
  const grant = await store.getInfluenceGrant(String(params.influenceGrantId)); if (!grant) throw new Error("AGENT_SURFACE_GRANT_NOT_FOUND");
  const proposal = AgentDecisionProposalSchema.parse(params.proposal);
  assertBehavioralProposalAuthorizedByGrant(proposal, grant, String(params.consumerAgentId));
  return { status: "AUTHORIZED", proposal: { executionId: proposal.executionId, proposedAction: proposal.proposedAction, requestedEffects: proposal.requestedEffects } };
}

async function submitOutcomeEvaluation(store: BehavioralMemoryStore, params: Record<string, unknown>) {
  const evaluation = BehavioralMemoryEvaluationSchema.parse(params.evaluation);
  const prior = await store.getExecutionMemory(evaluation.executionMemoryId); if (!prior) throw new Error("AGENT_SURFACE_MEMORY_NOT_FOUND");
  const result = applyMemoryUpdate({ prior, evaluation, newMemoryId: randomUUID() });
  await store.persistBehavioralEvaluation(evaluation); await store.persistMemoryUpdate(result.record); await store.persistExecutionMemory(result.memory);
  return { status: "UPDATED", directive: result.record.directive, priorMemoryId: prior.id, newMemoryId: result.memory.id, updateId: result.record.id };
}
