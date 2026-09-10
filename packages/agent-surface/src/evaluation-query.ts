import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SAFE_TOOLS = ["get_evaluation_summary", "compare_arms", "get_memory_update_history", "get_authority_boundary_metrics", "get_use_case_scorecard", "get_evidence_receipt"] as const;
const BASE = "evidence/canonical/analysis/latest";
const RESOURCES = {
  "engram://evaluations/latest": ["get_evaluation_summary", {}],
  "engram://evaluations/latest/arms": ["compare_arms", {}],
  "engram://evaluations/latest/observations": ["get_memory_update_history", {}],
  "engram://evaluations/latest/provenance": ["get_evidence_receipt", { runId: "latest" }],
  "engram://evaluations/latest/scorecard": ["get_use_case_scorecard", {}],
} as const;

async function readJson(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, BASE, name), "utf8")) as Record<string, unknown>;
}

export function createEvaluationQuerySurface(root = process.cwd()) {
  return {
    listTools: () => SAFE_TOOLS.map((name) => ({ name, description: `Read-only canonical Engram evaluation query: ${name}.`, inputSchema: name === "get_evidence_receipt" ? { type: "object", additionalProperties: false, properties: { runId: { type: "string" } } } : { type: "object", additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false }, _meta: { access: "read", confirmation: "none", hosted: false } })),
    listResources: () => Object.keys(RESOURCES),
    async readResource(uri: string): Promise<Record<string, unknown>> {
      const target = RESOURCES[uri as keyof typeof RESOURCES];
      if (!target) throw new Error(`EVALUATION_RESOURCE_NOT_FOUND:${uri}`);
      return this.call(target[0], target[1]);
    },
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
