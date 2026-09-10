import { describe, expect, it } from "vitest";
import { createDeterministicAdapter } from "../../packages/benchmark/src/adapters/deterministic.js";
import { runBenchmark } from "../../packages/benchmark/src/runner.js";
import { loadBenchmarkScenario, resolveBenchmarkScenarioPath } from "../../packages/benchmark/src/scenario.js";

const scenariosDir = "benchmarks/scenarios";

describe("benchmark scenario selection", () => {
  it("resolves a canonical scenario by name and preserves the provider default", () => {
    expect(resolveBenchmarkScenarioPath(undefined, scenariosDir)).toBe(`${scenariosDir}/provider-urgent.json`);
    expect(resolveBenchmarkScenarioPath("provider-urgent", scenariosDir)).toBe(`${scenariosDir}/provider-urgent.json`);
    expect(loadBenchmarkScenario(resolveBenchmarkScenarioPath("provider-urgent", scenariosDir)).scenarioId).toBe("provider-urgent");
  });

  it("accepts a nested relative JSON path within the scenarios directory", () => {
    expect(resolveBenchmarkScenarioPath("provider-urgent.json", scenariosDir)).toBe(`${scenariosDir}/provider-urgent.json`);
  });

  it.each(["../provider-urgent.json", "/tmp/provider-urgent.json", "provider-urgent.txt", "provider-urgent.json\0"]) (
    "rejects unsafe scenario selection %s",
    (selection) => {
      expect(() => resolveBenchmarkScenarioPath(selection, scenariosDir)).toThrow("BENCHMARK_SCENARIO_SELECTION_INVALID");
    },
  );
});

describe("benchmark runner manifest identity", () => {
  it("binds the manifest to the selected scenario identity", async () => {
    const selected = loadBenchmarkScenario(resolveBenchmarkScenarioPath("provider-urgent", scenariosDir));
    const run = await runBenchmark({ scenario: selected, adapter: createDeterministicAdapter(), evidenceMaturity: "SIMULATED_PASS" });

    expect(run.manifest.scenarioId).toBe(selected.scenarioId);
    expect(run.manifest.scenarioVersion).toBe(selected.version);
    expect(run.manifest.controls).toMatchObject(selected.fixed);
  });
});
