import type { OperationalMemory } from "./domain.js";

export type Route = readonly ["A", "B", "C" | "D"];
export const ROUTE_C: Route = ["A", "B", "C"];
export const ROUTE_D: Route = ["A", "B", "D"];

export type RankedMemory = {
  memory: OperationalMemory;
  semanticScore: number;
  contextScore: number;
  outcomeScore: number;
  recencyScore: number;
};

export type DecisionPolicyInput = {
  memories: RankedMemory[];
  memoryAvailable: boolean;
};

export type RouteDecision = {
  route: Route;
  reason: string;
  memoryRefs: string[];
  counterfactualRoute: Route;
};

export function scoreMemory(candidate: RankedMemory): number {
  return (
    candidate.semanticScore * 0.35 +
    candidate.contextScore * 0.25 +
    candidate.outcomeScore * 0.2 +
    candidate.memory.confidence * 0.15 +
    candidate.recencyScore * 0.05
  );
}

export function decideRoute(input: DecisionPolicyInput): RouteDecision {
  if (!input.memoryAvailable) {
    return {
      route: ROUTE_C,
      counterfactualRoute: ROUTE_C,
      memoryRefs: [],
      reason: "Memory is unavailable; baseline route policy selects Route C.",
    };
  }

  const relevant = input.memories
    .map((candidate) => ({ candidate, score: scoreMemory(candidate) }))
    .filter(({ candidate, score }) => {
      const context = candidate.memory.structuredContext;
      return score >= 0.65 && context.failureType === "LIQUIDITY_UNAVAILABLE" && context.failedVenue === "C";
    })
    .sort((a, b) => b.score - a.score);

  const influential = relevant[0];
  if (!influential) {
    return {
      route: ROUTE_C,
      counterfactualRoute: ROUTE_C,
      memoryRefs: [],
      reason: "No sufficiently relevant operational memory changed the baseline route.",
    };
  }

  return {
    route: ROUTE_D,
    counterfactualRoute: ROUTE_C,
    memoryRefs: [influential.candidate.memory.id],
    reason: `Avoided Venue C because memory ${influential.candidate.memory.id} records a comparable liquidity failure.`,
  };
}
