import { randomUUID } from "node:crypto";
import { ENGRAM_PROTOCOL_VERSION } from "../../../core/src/protocol.js";
import {
  EXECUTION_EPISODE_SCHEMA_VERSION,
  type ExecutionEpisode,
} from "../../../episode/src/schema.js";
import {
  ENGRAM_ADAPTER_CONTRACT_VERSION,
  type ExecutionEpisodeAdapter,
} from "../../src/contract.js";

export type LangGraphStateSnapshotLike = {
  values?: unknown;
  next?: readonly string[];
  config?: {
    configurable?: {
      thread_id?: string;
      checkpoint_id?: string;
      checkpoint_ns?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  metadata?: {
    step?: number;
    source?: string;
    [key: string]: unknown;
  };
  tasks?: readonly unknown[];
  createdAt?: string | Date;
  created_at?: string | Date;
};

export type LangGraphExecutionSnapshot = {
  executionId: string;
  threadId: string;
  agentId: string;
  agentVersion?: string;
  workflowType: string;
  intent: string;
  context?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  environmentVersion?: string;
  toolVersion?: string;
  policyVersion?: string;
  startedAt: Date | string;
  completedAt?: Date | string;
  checkpoints: LangGraphStateSnapshotLike[];
  finalState?: unknown;
  outcome?: {
    status: "SUCCESS" | "FAILURE" | "PARTIAL" | "COMPENSATED" | "ABORTED" | "UNKNOWN";
    summary: string;
    result?: Record<string, unknown>;
    evidenceState?: "VERIFIED" | "OBSERVED" | "SIMULATED" | "INFERRED" | "PROPOSED" | "UNKNOWN";
  };
};

export interface LangGraphStateHistoryProvider {
  getStateHistory(config: unknown): AsyncIterable<LangGraphStateSnapshotLike>;
}

function serialize(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function checkpointId(snapshot: LangGraphStateSnapshotLike, threadId: string, index: number): string {
  const configurable = snapshot.config?.configurable;
  return configurable?.checkpoint_id
    ?? `${threadId}:step:${snapshot.metadata?.step ?? index}`;
}

export const langGraphAdapter: ExecutionEpisodeAdapter<LangGraphExecutionSnapshot> = {
  metadata: {
    contractVersion: ENGRAM_ADAPTER_CONTRACT_VERSION,
    name: "langgraph",
    version: "1.0.0",
    source: "@langchain/langgraph",
  },

  canAdapt(input: unknown): input is LangGraphExecutionSnapshot {
    if (!input || typeof input !== "object") return false;
    const value = input as Partial<LangGraphExecutionSnapshot>;
    return typeof value.executionId === "string"
      && typeof value.threadId === "string"
      && typeof value.agentId === "string"
      && typeof value.workflowType === "string"
      && typeof value.intent === "string"
      && Array.isArray(value.checkpoints);
  },

  adapt(input): ExecutionEpisode {
    const startedAt = new Date(input.startedAt);
    const completedAt = input.completedAt ? new Date(input.completedAt) : undefined;
    const observations: ExecutionEpisode["observations"] = input.checkpoints.map((snapshot, index) => {
      const sourceId = checkpointId(snapshot, input.threadId, index);
      const observedAt = snapshot.createdAt ?? snapshot.created_at;
      return {
        id: randomUUID(),
        type: "LANGGRAPH_CHECKPOINT",
        payload: {
          threadId: input.threadId,
          checkpointId: snapshot.config?.configurable?.checkpoint_id ?? null,
          checkpointNamespace: snapshot.config?.configurable?.checkpoint_ns ?? null,
          step: snapshot.metadata?.step ?? index,
          source: snapshot.metadata?.source ?? null,
          values: serialize(snapshot.values),
          next: serialize(snapshot.next ?? []),
          tasks: serialize(snapshot.tasks ?? []),
        },
        evidenceState: "OBSERVED",
        observedAt: observedAt ? new Date(observedAt) : completedAt ?? startedAt,
        provenance: [{
          sourceType: "EXTERNAL_SYSTEM",
          sourceId,
          evidenceState: "OBSERVED",
          observedAt: observedAt ? new Date(observedAt) : completedAt ?? startedAt,
        }],
      };
    });

    if (input.finalState !== undefined) {
      observations.push({
        id: randomUUID(),
        type: "LANGGRAPH_FINAL_STATE",
        payload: { threadId: input.threadId, value: serialize(input.finalState) },
        evidenceState: "OBSERVED",
        observedAt: completedAt ?? startedAt,
        provenance: [{
          sourceType: "EXTERNAL_SYSTEM",
          sourceId: input.threadId,
          evidenceState: "OBSERVED",
          observedAt: completedAt ?? startedAt,
        }],
      });
    }

    return {
      schemaVersion: EXECUTION_EPISODE_SCHEMA_VERSION,
      protocolVersion: ENGRAM_PROTOCOL_VERSION,
      id: input.executionId,
      agent: { id: input.agentId, version: input.agentVersion },
      workflowType: input.workflowType,
      intent: input.intent,
      context: {
        ...(input.context ?? {}),
        langGraph: {
          threadId: input.threadId,
          checkpointCount: input.checkpoints.length,
        },
      },
      constraints: input.constraints ?? {},
      environment: {
        environmentVersion: input.environmentVersion,
        toolVersion: input.toolVersion,
        policyVersion: input.policyVersion,
      },
      startedAt,
      decisions: [],
      observations,
      outcome: input.outcome && completedAt ? {
        status: input.outcome.status,
        summary: input.outcome.summary,
        result: input.outcome.result ?? {},
        evidenceState: input.outcome.evidenceState ?? "OBSERVED",
        completedAt,
      } : undefined,
      provenance: [{
        sourceType: "EXTERNAL_SYSTEM",
        sourceId: input.threadId,
        evidenceState: "OBSERVED",
        observedAt: completedAt ?? startedAt,
      }],
    };
  },
};

/**
 * Read the public LangGraph state-history surface without requiring LangGraph
 * as an Engram core dependency. Pass a compiled graph and its normal config.
 */
export async function collectLangGraphStateHistory(
  graph: LangGraphStateHistoryProvider,
  config: unknown,
): Promise<LangGraphStateSnapshotLike[]> {
  const history: LangGraphStateSnapshotLike[] = [];
  for await (const snapshot of graph.getStateHistory(config)) history.push(snapshot);
  return history;
}
