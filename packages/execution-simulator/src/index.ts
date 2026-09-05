export type Venue = "A" | "B" | "C" | "D";
export type Route = readonly [Venue, Venue, Venue];

export type SimulatorContext = {
  liquidity: Record<Venue, number>;
  requiredLiquidity: number;
};

export type StepResult = {
  venue: Venue;
  status: "SUCCESS" | "FAILURE";
  reason?: "LIQUIDITY_UNAVAILABLE";
};

export type SimulationResult = {
  route: Route;
  steps: StepResult[];
  status: "SUCCESS" | "COMPENSATED";
  failedVenue?: Venue;
  recovery?: {
    strategy: "UNWIND_PREVIOUS_LEG";
    capitalRecovered: true;
  };
};

export const ROUTE_C: Route = ["A", "B", "C"];
export const ROUTE_D: Route = ["A", "B", "D"];

/**
 * Deterministic demo workload. This is explicitly SIMULATED external execution,
 * not a live market or DeFi integration.
 */
export function executeRoute(route: Route, context: SimulatorContext): SimulationResult {
  const steps: StepResult[] = [];

  for (const venue of route) {
    if (context.liquidity[venue] < context.requiredLiquidity) {
      steps.push({ venue, status: "FAILURE", reason: "LIQUIDITY_UNAVAILABLE" });
      return {
        route,
        steps,
        status: "COMPENSATED",
        failedVenue: venue,
        recovery: {
          strategy: "UNWIND_PREVIOUS_LEG",
          capitalRecovered: true,
        },
      };
    }

    steps.push({ venue, status: "SUCCESS" });
  }

  return { route, steps, status: "SUCCESS" };
}
