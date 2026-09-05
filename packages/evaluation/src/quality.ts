import type { MemoryEvaluationStore } from "./store.js";
import type { MemoryQualityAssessment, MemoryUsefulnessMetrics } from "./domain.js";

export function assessUsefulnessMetrics(metrics: MemoryUsefulnessMetrics): MemoryQualityAssessment {
  const warnings: string[] = [];

  if (metrics.retrievalCount === 0) warnings.push("NEVER_RETRIEVED");
  if (metrics.retrievalCount > 0 && metrics.exposedRetrievalCount === 0) warnings.push("RETRIEVED_NEVER_EXPOSED");
  if (metrics.exposedRetrievalCount > 0 && metrics.influenceCount === 0) warnings.push("EXPOSED_NEVER_INFLUENCED");
  if (metrics.changedActionCount > 0 && metrics.explicitEvaluations === 0) warnings.push("CHANGED_ACTION_WITHOUT_EFFECT_EVALUATION");
  if (metrics.harmfulEvaluations > 0) warnings.push("HARMFUL_EFFECT_RECORDED");
  if (metrics.observationalEvaluations > 0 && metrics.controlledEvaluations === 0) warnings.push("ONLY_OBSERVATIONAL_EFFECT_EVIDENCE");

  let interpretation: MemoryQualityAssessment["interpretation"] = "INSUFFICIENT_EVIDENCE";
  if (metrics.beneficialEvaluations > 0 && metrics.harmfulEvaluations > 0) interpretation = "MIXED_EVIDENCE";
  else if (metrics.beneficialEvaluations > 0) interpretation = "POSITIVE_EVIDENCE";
  else if (metrics.harmfulEvaluations > 0) interpretation = "NEGATIVE_EVIDENCE";

  return {
    memoryId: metrics.memoryId,
    usefulness: metrics,
    warnings,
    interpretation,
  };
}

export async function assessMemoryQuality(
  store: MemoryEvaluationStore,
  memoryId: string,
): Promise<MemoryQualityAssessment> {
  return assessUsefulnessMetrics(await store.getUsefulnessMetrics(memoryId));
}
