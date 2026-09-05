import type { BehavioralMemoryEvaluation } from "../../evaluation/src/memory-evaluation.js";
import type { CandidateMemory } from "../../memory-core/src/candidate-memory.js";
import type { ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { MemorySlice } from "../../memory-core/src/memory-slice.js";
import type { ExecutionEpisode } from "./episode.js";
import type { ExecutionSlice } from "./execution-slice.js";
import type { Experience } from "./experience.js";

export type BehavioralMemoryGraph = {
  episodes: ExecutionEpisode[];
  executionSlices: ExecutionSlice[];
  experiences: Experience[];
  candidateMemory: CandidateMemory;
  executionMemory: ExecutionMemory;
  memorySlices: MemorySlice[];
  influenceGrants: InfluenceGrant[];
  evaluations: BehavioralMemoryEvaluation[];
};

/**
 * Persistence contract for Engram's behavioral-memory primitives.
 *
 * The contract deliberately contains no model/runtime-specific methods. A local
 * Qwen process, a hosted model, or a deterministic policy can consume the same
 * persisted graph without changing Engram's memory semantics.
 */
export interface BehavioralMemoryStore {
  persistEpisode(episode: ExecutionEpisode): Promise<void>;
  getEpisode(episodeId: string): Promise<ExecutionEpisode | null>;

  persistExecutionSlice(slice: ExecutionSlice): Promise<void>;
  getExecutionSlice(sliceId: string): Promise<ExecutionSlice | null>;

  persistExperience(experience: Experience): Promise<void>;
  getExperience(experienceId: string): Promise<Experience | null>;

  persistCandidateMemory(memory: CandidateMemory): Promise<void>;
  getCandidateMemory(candidateMemoryId: string): Promise<CandidateMemory | null>;

  persistExecutionMemory(memory: ExecutionMemory): Promise<void>;
  getExecutionMemory(executionMemoryId: string): Promise<ExecutionMemory | null>;

  persistMemorySlice(slice: MemorySlice): Promise<void>;
  getMemorySlice(memorySliceId: string): Promise<MemorySlice | null>;
  listMemorySlicesForExecution(executionId: string): Promise<MemorySlice[]>;

  persistInfluenceGrant(grant: InfluenceGrant): Promise<void>;
  getInfluenceGrant(influenceGrantId: string): Promise<InfluenceGrant | null>;
  listInfluenceGrantsForExecution(executionId: string): Promise<InfluenceGrant[]>;

  persistBehavioralEvaluation(evaluation: BehavioralMemoryEvaluation): Promise<void>;
  getBehavioralEvaluation(evaluationId: string): Promise<BehavioralMemoryEvaluation | null>;
  listBehavioralEvaluationsForMemory(executionMemoryId: string): Promise<BehavioralMemoryEvaluation[]>;

  loadBehavioralMemoryGraph(executionMemoryId: string): Promise<BehavioralMemoryGraph>;
}
