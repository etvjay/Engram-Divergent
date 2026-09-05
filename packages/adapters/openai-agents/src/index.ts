import { randomUUID } from "node:crypto";
import {
  EXECUTION_EPISODE_SCHEMA_VERSION,
  type ExecutionEpisode,
} from "../../../episode/src/schema.js";
import { ENGRAM_PROTOCOL_VERSION } from "../../../core/src/protocol.js";
import {
  ENGRAM_ADAPTER_CONTRACT_VERSION,
  type ExecutionEpisodeAdapter,
} from "../../src/contract.js";

export type OpenAIAgentsRunResultLike = {
  finalOutput?: unknown;
  output?: unknown[];
  newItems?: unknown[];
  rawResponses?: unknown[];
  interruptions?: unknown[];
  inputGuardrailResults?: unknown[];
  outputGuardrailResults?: unknown[];
  toolInputGuardrailResults?: unknown[];
  toolOutputGuardrailResults?: unknown[];
  lastAgent?: { name?: string } | null;
};

export type OpenAIAgentsTraceSpanSnapshot = {
  traceId?: string;
  spanId?: string;
  parentId?: string | null;
  startedAt?: string;
  endedAt?: string;
  data: unknown;
};

export type OpenAIAgentsTraceSnapshot = {
  traceId: string;
  name?: string;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  endedAt?: string;
  spans: OpenAIAgentsTraceSpanSnapshot[];
};

export type OpenAIAgentsExecutionSnapshot = {
  executionId: string;
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
  result: OpenAIAgentsRunResultLike;
  trace?: OpenAIAgentsTraceSnapshot;
  outcome?: {
    status: "SUCCESS" | "FAILURE" | "PARTIAL" | "COMPENSATED" | "ABORTED" | "UNKNOWN";
    summary: string;
    result?: Record<string, unknown>;
    evidenceState?: "VERIFIED" | "OBSERVED" | "SIMULATED" | "INFERRED" | "PROPOSED" | "UNKNOWN";
  };
};

function serialize(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function itemType(item: unknown): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ["type", "name", "kind"]) {
      if (typeof record[key] === "string" && record[key]) return `OPENAI_AGENTS_${String(record[key]).toUpperCase()}`;
    }
    const ctor = (item as { constructor?: { name?: string } }).constructor?.name;
    if (ctor && ctor !== "Object") return `OPENAI_AGENTS_${ctor.toUpperCase()}`;
  }
  return "OPENAI_AGENTS_RUN_ITEM";
}

export const openAIAgentsAdapter: ExecutionEpisodeAdapter<OpenAIAgentsExecutionSnapshot> = {
  metadata: {
    contractVersion: ENGRAM_ADAPTER_CONTRACT_VERSION,
    name: "openai-agents",
    version: "1.0.0",
    source: "@openai/agents",
  },

  canAdapt(input: unknown): input is OpenAIAgentsExecutionSnapshot {
    if (!input || typeof input !== "object") return false;
    const value = input as Partial<OpenAIAgentsExecutionSnapshot>;
    return typeof value.executionId === "string"
      && typeof value.agentId === "string"
      && typeof value.workflowType === "string"
      && typeof value.intent === "string"
      && Boolean(value.result && typeof value.result === "object");
  },

  adapt(input): ExecutionEpisode {
    const startedAt = new Date(input.startedAt);
    const completedAt = input.completedAt ? new Date(input.completedAt) : undefined;
    const observations: ExecutionEpisode["observations"] = (input.result.newItems ?? []).map((item, index) => ({
      id: randomUUID(),
      type: itemType(item),
      payload: {
        index,
        item: serialize(item),
      },
      evidenceState: "OBSERVED",
      observedAt: completedAt ?? startedAt,
      provenance: input.trace ? [{
        sourceType: "EXTERNAL_SYSTEM",
        sourceId: input.trace.traceId,
        evidenceState: "OBSERVED",
        observedAt: completedAt ?? startedAt,
      }] : [],
    }));

    if (input.trace) {
      observations.push({
        id: randomUUID(),
        type: "OPENAI_AGENTS_TRACE",
        payload: {
          traceId: input.trace.traceId,
          name: input.trace.name ?? null,
          metadata: input.trace.metadata ?? {},
          spans: serialize(input.trace.spans),
        },
        evidenceState: "OBSERVED",
        observedAt: completedAt ?? startedAt,
        provenance: [{
          sourceType: "EXTERNAL_SYSTEM",
          sourceId: input.trace.traceId,
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
        openaiAgents: {
          lastAgentName: input.result.lastAgent?.name ?? null,
          finalOutput: serialize(input.result.finalOutput),
          interruptions: serialize(input.result.interruptions ?? []),
          guardrails: {
            input: serialize(input.result.inputGuardrailResults ?? []),
            output: serialize(input.result.outputGuardrailResults ?? []),
            toolInput: serialize(input.result.toolInputGuardrailResults ?? []),
            toolOutput: serialize(input.result.toolOutputGuardrailResults ?? []),
          },
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
      provenance: input.trace ? [{
        sourceType: "EXTERNAL_SYSTEM",
        sourceId: input.trace.traceId,
        evidenceState: "OBSERVED",
        observedAt: completedAt ?? startedAt,
      }] : [],
    };
  },
};

/**
 * A dependency-free structural tracing processor compatible with the public
 * OpenAI Agents TracingProcessor lifecycle. Pass it to addTraceProcessor().
 */
export class EngramOpenAIAgentsTraceCollector {
  private readonly traces = new Map<string, OpenAIAgentsTraceSnapshot>();

  async onTraceStart(trace: unknown): Promise<void> {
    const value = snapshotObject(trace);
    const traceId = requiredString(value.traceId, "OpenAI trace.traceId");
    this.traces.set(traceId, {
      traceId,
      name: typeof value.name === "string" ? value.name : undefined,
      metadata: isRecord(value.metadata) ? value.metadata : undefined,
      startedAt: new Date().toISOString(),
      spans: [],
    });
  }

  async onTraceEnd(trace: unknown): Promise<void> {
    const value = snapshotObject(trace);
    const traceId = requiredString(value.traceId, "OpenAI trace.traceId");
    const current = this.traces.get(traceId) ?? { traceId, spans: [] };
    current.endedAt = new Date().toISOString();
    if (typeof value.name === "string") current.name = value.name;
    if (isRecord(value.metadata)) current.metadata = value.metadata;
    this.traces.set(traceId, current);
  }

  async onSpanStart(_span: unknown): Promise<void> {}

  async onSpanEnd(span: unknown): Promise<void> {
    const value = snapshotObject(span);
    const traceId = typeof value.traceId === "string" ? value.traceId : undefined;
    if (!traceId) return;
    const current = this.traces.get(traceId) ?? { traceId, spans: [] };
    current.spans.push({
      traceId,
      spanId: typeof value.spanId === "string" ? value.spanId : undefined,
      parentId: typeof value.parentId === "string" || value.parentId === null ? value.parentId : undefined,
      startedAt: typeof value.startedAt === "string" ? value.startedAt : undefined,
      endedAt: typeof value.endedAt === "string" ? value.endedAt : undefined,
      data: serialize(value.spanData ?? value.data ?? value),
    });
    this.traces.set(traceId, current);
  }

  async forceFlush(): Promise<void> {}
  async shutdown(_timeout?: number): Promise<void> {}

  snapshot(traceId: string): OpenAIAgentsTraceSnapshot | null {
    const trace = this.traces.get(traceId);
    return trace ? structuredClone(trace) : null;
  }

  drain(traceId: string): OpenAIAgentsTraceSnapshot | null {
    const snapshot = this.snapshot(traceId);
    this.traces.delete(traceId);
    return snapshot;
  }
}

function snapshotObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === "function") {
      const json = withJson.toJSON();
      if (isRecord(json)) return json;
    }
    return value as Record<string, unknown>;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  return value;
}
