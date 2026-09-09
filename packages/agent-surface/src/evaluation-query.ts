import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SAFE_TOOLS = ["get_evaluation_summary", "compare_arms", "get_memory_update_history", "get_authority_boundary_metrics", "get_use_case_scorecard", "get_evidence_receipt"] as const;
const BASE = "evidence/canonical/analysis/latest";

async function readJson(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, BASE, name), "utf8")) as Record<string, unknown>;
}

export function createEvaluationQuerySurface(root = process.cwd()) {
  return {
    listTools: () => SAFE_TOOLS.map((name) => ({ name, description: `Read-only canonical Engram evaluation query: ${name}.` })),
    listResources: () => ["engram://evaluations/latest", "engram://evaluations/latest/arms", "engram://evaluations/latest/observations", "engram://evaluations/latest/provenance", "engram://evaluations/latest/scorecard"],
    async call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
      switch (method) {
        case "get_evaluation_summary": return readJson(root, "manifest.json");
        case "compare_arms": {
          const data = await readFile(resolve(root, BASE, "arm-metrics.csv"), "utf8");
          return { csv: data, source: `${BASE}/arm-metrics.csv` };
        }
        case "get_memory_update_history": {
          const data = await readJson(root, "heldout-evaluation.json");
          return { toolRecovery: data.toolRecovery, agentHandoff: data.agentHandoff, source: `${BASE}/heldout-evaluation.json` };
        }
        case "get_authority_boundary_metrics": {
          const data = await readJson(root, "heldout-evaluation.json");
          return { toolRecovery: data.toolRecovery && (data.toolRecovery as Record<string, unknown>).metrics, agentHandoff: data.agentHandoff && (data.agentHandoff as Record<string, unknown>).metrics, source: `${BASE}/heldout-evaluation.json` };
        }
        case "get_use_case_scorecard": return readJson(root, "eval-scorecard.json");
        case "get_evidence_receipt": return { source: `${BASE}/manifest.json`, manifest: await readJson(root, "manifest.json"), requestedRunId: params.runId ?? "latest" };
        default: throw new Error(`EVALUATION_QUERY_METHOD_NOT_FOUND:${method}`);
      }
    },
  };
}
