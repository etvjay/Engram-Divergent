import { createAgentSurface } from "./server.js";
import type { BehavioralMemoryStore } from "../../experience/src/store.js";

type JsonRecord = Record<string, unknown>;
export type AgentSurface = ReturnType<typeof createAgentSurface>;

export type EngramClientOptions = {
  store?: BehavioralMemoryStore;
  surface?: AgentSurface;
};

export type CompleteExecutionInput = {
  execution: JsonRecord;
  events?: unknown[];
  outcome: JsonRecord;
  evidenceRefs?: string[];
  subject?: string;
  fields?: JsonRecord;
  observation?: string;
  interpretation?: string;
  applicability?: JsonRecord;
  confidence?: number;
  memoryType?: string;
  summary?: string;
};

/**
 * Typed developer wrapper over the existing bounded agent surface.
 * It delegates all formation, eligibility, authorization, and update semantics
 * to createAgentSurface rather than reimplementing them.
 */
export class EngramClient {
  private readonly surface: AgentSurface;

  constructor(options: EngramClientOptions) {
    if (!options.surface && !options.store) throw new Error("ENGRAM_CLIENT_STORE_OR_SURFACE_REQUIRED");
    this.surface = options.surface ?? createAgentSurface(options.store!);
  }

  async recordCompleteExecution(input: CompleteExecutionInput): Promise<JsonRecord> {
    return this.call("record_complete_execution", input);
  }

  async recallApplicableMemory(input: JsonRecord): Promise<JsonRecord> {
    return this.call("recall_applicable_memory", input);
  }

  async requestInfluence(input: JsonRecord): Promise<JsonRecord> {
    return this.call("request_influence", input);
  }

  async submitOutcomeEvaluation(input: JsonRecord): Promise<JsonRecord> {
    return this.call("submit_outcome_evaluation", input);
  }

  async getEvaluationSummary(): Promise<JsonRecord> {
    return this.call("get_evaluation_summary", {});
  }

  async compareArms(): Promise<JsonRecord> {
    return this.call("compare_arms", {});
  }

  async getUseCaseScorecard(): Promise<JsonRecord> {
    return this.call("get_use_case_scorecard", {});
  }

  private async call(name: string, arguments_: JsonRecord): Promise<JsonRecord> {
    return this.surface.call({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: arguments_ },
    });
  }
}

export function createEngramClient(options: EngramClientOptions): EngramClient {
  return new EngramClient(options);
}
