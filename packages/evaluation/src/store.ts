import type {
  CounterfactualExperiment,
  MemoryEvaluation,
  MemoryRelationship,
  MemoryUsefulnessMetrics,
} from "./domain.js";

export interface MemoryEvaluationStore {
  recordEvaluation(evaluation: MemoryEvaluation): Promise<void>;
  recordRelationship(relationship: MemoryRelationship): Promise<void>;
  recordExperiment(experiment: CounterfactualExperiment): Promise<void>;
  getUsefulnessMetrics(memoryId: string): Promise<MemoryUsefulnessMetrics>;
  listEvaluations(memoryId: string): Promise<MemoryEvaluation[]>;
  listRelationships(memoryId: string): Promise<MemoryRelationship[]>;
  listExperiments(memoryId: string): Promise<CounterfactualExperiment[]>;
}
