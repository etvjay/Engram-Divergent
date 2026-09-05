import type { BehavioralMemoryEvaluation } from "../../evaluation/src/memory-evaluation.js";
import type { CandidateMemory } from "../../memory-core/src/candidate-memory.js";
import type { ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import type { InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import type { MemorySlice } from "../../memory-core/src/memory-slice.js";
import type { Experience } from "./experience.js";
import type { ExecutionEpisode } from "./episode.js";
import type { ExecutionSlice } from "./execution-slice.js";

export type BehavioralMemoryLineage = {
  episodes: ExecutionEpisode[];
  executionSlices: ExecutionSlice[];
  experiences: Experience[];
  candidateMemory: CandidateMemory;
  executionMemory: ExecutionMemory;
  memorySlice: MemorySlice;
  influenceGrant: InfluenceGrant;
  evaluation?: BehavioralMemoryEvaluation;
};

export function validateBehavioralMemoryLineage(lineage: BehavioralMemoryLineage): string[] {
  const errors: string[] = [];
  const episodes = new Map(lineage.episodes.map((episode) => [episode.id, episode]));
  const slices = new Map(lineage.executionSlices.map((slice) => [slice.id, slice]));
  const experiences = new Map(lineage.experiences.map((experience) => [experience.id, experience]));

  for (const slice of lineage.executionSlices) {
    const episode = episodes.get(slice.episodeId);
    if (!episode) {
      errors.push(`EXECUTION_SLICE_EPISODE_NOT_FOUND:${slice.id}:${slice.episodeId}`);
      continue;
    }
    if (episode.executionId !== slice.executionId) {
      errors.push(`EXECUTION_SLICE_EXECUTION_MISMATCH:${slice.id}`);
    }
  }

  for (const experience of lineage.experiences) {
    for (const episodeId of experience.sourceEpisodeIds) {
      if (!episodes.has(episodeId)) errors.push(`EXPERIENCE_EPISODE_NOT_FOUND:${experience.id}:${episodeId}`);
    }
    for (const sliceId of experience.sourceSliceIds) {
      const slice = slices.get(sliceId);
      if (!slice) {
        errors.push(`EXPERIENCE_SLICE_NOT_FOUND:${experience.id}:${sliceId}`);
      } else if (!experience.sourceEpisodeIds.includes(slice.episodeId)) {
        errors.push(`EXPERIENCE_SLICE_EPISODE_UNDECLARED:${experience.id}:${sliceId}`);
      }
    }
  }

  for (const experienceId of lineage.candidateMemory.sourceExperienceIds) {
    if (!experiences.has(experienceId)) {
      errors.push(`CANDIDATE_MEMORY_EXPERIENCE_NOT_FOUND:${lineage.candidateMemory.id}:${experienceId}`);
    }
  }
  for (const episodeId of lineage.candidateMemory.sourceEpisodeIds) {
    if (!episodes.has(episodeId)) {
      errors.push(`CANDIDATE_MEMORY_EPISODE_NOT_FOUND:${lineage.candidateMemory.id}:${episodeId}`);
    }
  }

  if (lineage.executionMemory.sourceCandidateMemoryId !== lineage.candidateMemory.id) {
    errors.push("EXECUTION_MEMORY_CANDIDATE_MISMATCH");
  }
  for (const experienceId of lineage.executionMemory.sourceExperienceIds) {
    if (!lineage.candidateMemory.sourceExperienceIds.includes(experienceId)) {
      errors.push(`EXECUTION_MEMORY_EXPERIENCE_NOT_IN_CANDIDATE:${experienceId}`);
    }
  }
  for (const episodeId of lineage.executionMemory.sourceEpisodeIds) {
    if (!lineage.candidateMemory.sourceEpisodeIds.includes(episodeId)) {
      errors.push(`EXECUTION_MEMORY_EPISODE_NOT_IN_CANDIDATE:${episodeId}`);
    }
  }

  if (!lineage.memorySlice.executionMemoryIds.includes(lineage.executionMemory.id)) {
    errors.push("MEMORY_SLICE_DOES_NOT_REFERENCE_EXECUTION_MEMORY");
  }
  if (lineage.influenceGrant.memorySliceId !== lineage.memorySlice.id) {
    errors.push("INFLUENCE_GRANT_MEMORY_SLICE_MISMATCH");
  }
  if (lineage.influenceGrant.consumerAgentId !== lineage.memorySlice.consumerAgentId) {
    errors.push("INFLUENCE_GRANT_CONSUMER_AGENT_MISMATCH");
  }
  if (lineage.influenceGrant.consumerExecutionId !== lineage.memorySlice.consumerExecutionId) {
    errors.push("INFLUENCE_GRANT_CONSUMER_EXECUTION_MISMATCH");
  }

  if (lineage.evaluation) {
    if (lineage.evaluation.executionMemoryId !== lineage.executionMemory.id) {
      errors.push("EVALUATION_EXECUTION_MEMORY_MISMATCH");
    }
    if (lineage.evaluation.memorySliceId !== lineage.memorySlice.id) {
      errors.push("EVALUATION_MEMORY_SLICE_MISMATCH");
    }
    if (lineage.evaluation.influenceGrantId !== lineage.influenceGrant.id) {
      errors.push("EVALUATION_INFLUENCE_GRANT_MISMATCH");
    }
    if (lineage.evaluation.influencedExecutionId !== lineage.memorySlice.consumerExecutionId) {
      errors.push("EVALUATION_EXECUTION_MISMATCH");
    }
  }

  return errors;
}

export function assertBehavioralMemoryLineage(lineage: BehavioralMemoryLineage): void {
  const errors = validateBehavioralMemoryLineage(lineage);
  if (errors.length) throw new Error(`INVALID_BEHAVIORAL_MEMORY_LINEAGE:${errors.join(",")}`);
}

export function assertInfluenceAllowed(grant: InfluenceGrant, effect: string): void {
  if (grant.deniedEffects.includes(effect)) {
    throw new Error(`INFLUENCE_EFFECT_DENIED:${effect}`);
  }
  if (!grant.allowedEffects.includes(effect)) {
    throw new Error(`INFLUENCE_EFFECT_NOT_GRANTED:${effect}`);
  }
}
