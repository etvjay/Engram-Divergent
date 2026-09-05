import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { EvidenceState, MemoryRecall } from "../../core/src/protocol.js";
import type {
  ExecutionContext,
  ExecutionEvent,
  MemorySearchInput,
  MemorySearchResult,
  OperationalMemory,
  Outcome,
} from "../../memory-core/src/domain.js";
import { scoreMemory } from "../../memory-core/src/policy.js";
import type { EngramRuntimeStore } from "../../runtime/src/store.js";
import type {
  RecallExposureUpdate,
  RuntimeDecisionRecord,
  RuntimeEvaluationEvent,
  RuntimeExecutionRecord,
} from "../../runtime/src/types.js";

function resolveBridgePath(): string {
  return process.env.ENGRAM_SIBYL_BRIDGE ?? resolve(process.cwd(), "packages/sibyl/bridge.py");
}

type BridgeResponse<T> = { ok: true; result: T } | { ok: false; error: { type: string; message: string } };

async function bridge<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const python = process.env.ENGRAM_SIBYL_PYTHON ?? "python3";
  return new Promise<T>((resolveResult, reject) => {
    const child = spawn(python, [resolveBridgePath()], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed: BridgeResponse<T> | undefined;
      try {
        parsed = JSON.parse(stdout) as BridgeResponse<T>;
      } catch {
        reject(new Error(`SIBYL_BRIDGE_INVALID_RESPONSE: exit=${code}; stderr=${stderr}; stdout=${stdout}`));
        return;
      }
      if (!parsed.ok) {
        reject(new Error(`SIBYL_${parsed.error.type}: ${parsed.error.message}`));
        return;
      }
      resolveResult(parsed.result);
    });
    child.stdin.end(JSON.stringify({ op, args }));
  });
}

function iso(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

function asDate(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}

function serializeMemory(memory: OperationalMemory): Record<string, unknown> {
  return {
    ...memory,
    validFrom: iso(memory.validFrom),
    validUntil: iso(memory.validUntil),
  };
}

function deserializeMemory(raw: Record<string, unknown>): OperationalMemory {
  return {
    id: String(raw.id),
    agentId: String(raw.agentId),
    memoryType: String(raw.memoryType),
    summary: String(raw.summary),
    structuredContext: (raw.structuredContext ?? {}) as Record<string, unknown>,
    confidence: Number(raw.confidence),
    evidenceState: raw.evidenceState as OperationalMemory["evidenceState"],
    validFrom: asDate(raw.validFrom),
    validUntil: asDate(raw.validUntil),
    environmentVersion: typeof raw.environmentVersion === "string" ? raw.environmentVersion : undefined,
    toolVersion: typeof raw.toolVersion === "string" ? raw.toolVersion : undefined,
    policyVersion: typeof raw.policyVersion === "string" ? raw.policyVersion : undefined,
  };
}

async function put(category: string, name: string, body: Record<string, unknown>): Promise<void> {
  await bridge("put", { category, name, body });
}

async function get<T>(category: string, name: string): Promise<T | null> {
  return bridge<T | null>("get", { category, name });
}

async function list<T>(category: string): Promise<T[]> {
  return bridge<T[]>("list", { category });
}

export class SibylRuntimeStore implements EngramRuntimeStore {
  async ping(): Promise<{ tenant: string; schemaVersion: number | null }> {
    return bridge("ping");
  }

  async startExecution(input: ExecutionContext): Promise<{ executionId: string }> {
    const executionId = randomUUID();
    const record: Record<string, unknown> = {
      id: executionId,
      ...input,
      status: "RUNNING",
      startedAt: new Date().toISOString(),
    };
    await put("execution", executionId, record);
    return { executionId };
  }

  async getExecution(executionId: string): Promise<RuntimeExecutionRecord | null> {
    const raw = await get<Record<string, unknown>>("execution", executionId);
    if (!raw) return null;
    return {
      id: String(raw.id),
      agentId: String(raw.agentId),
      agentVersion: typeof raw.agentVersion === "string" ? raw.agentVersion : undefined,
      workflowType: String(raw.workflowType),
      intent: String(raw.intent),
      context: (raw.context ?? {}) as Record<string, unknown>,
      constraints: (raw.constraints ?? {}) as Record<string, unknown>,
      environmentVersion: typeof raw.environmentVersion === "string" ? raw.environmentVersion : undefined,
      toolVersion: typeof raw.toolVersion === "string" ? raw.toolVersion : undefined,
      policyVersion: typeof raw.policyVersion === "string" ? raw.policyVersion : undefined,
      memoryPolicyBundleVersion: typeof raw.memoryPolicyBundleVersion === "string" ? raw.memoryPolicyBundleVersion : undefined,
      status: raw.status as RuntimeExecutionRecord["status"],
      startedAt: new Date(String(raw.startedAt)),
      completedAt: typeof raw.completedAt === "string" ? new Date(raw.completedAt) : undefined,
    };
  }

  async setExecutionMemoryPolicy(executionId: string, bundleVersion: string): Promise<void> {
    const execution = await get<Record<string, unknown>>("execution", executionId);
    if (!execution) throw new Error(`Execution ${executionId} does not exist`);
    const current = execution.memoryPolicyBundleVersion;
    if (current && current !== bundleVersion) {
      throw new Error(`EXECUTION_POLICY_FROZEN: execution ${executionId} already uses ${String(current)}`);
    }
    await put("execution", executionId, { ...execution, memoryPolicyBundleVersion: bundleVersion });
  }

  async nextEventSequence(executionId: string): Promise<number> {
    const events = await list<Record<string, unknown>>("execution_event");
    return events.filter((event) => event.executionId === executionId).length;
  }

  async appendEvent(event: ExecutionEvent): Promise<void> {
    const key = `${event.executionId}-${event.sequenceNo}`;
    const existing = await get<Record<string, unknown>>("execution_event", key);
    const body = { ...event, occurredAt: event.occurredAt.toISOString() };
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(body)) return;
      throw new Error(`EVENT_IDEMPOTENCY_CONFLICT:${event.executionId}:${event.sequenceNo}`);
    }
    await put("execution_event", key, body);
  }

  async recordOutcome(outcome: Outcome): Promise<void> {
    const existing = await get<Record<string, unknown>>("outcome", outcome.executionId);
    const body = { ...outcome } as Record<string, unknown>;
    if (existing && JSON.stringify(existing) !== JSON.stringify(body)) {
      throw new Error(`OUTCOME_IDEMPOTENCY_CONFLICT:${outcome.executionId}`);
    }
    await put("outcome", outcome.executionId, body);
    const execution = await get<Record<string, unknown>>("execution", outcome.executionId);
    if (!execution) throw new Error(`Execution ${outcome.executionId} does not exist`);
    await put("execution", outcome.executionId, {
      ...execution,
      status: outcome.status,
      completedAt: new Date().toISOString(),
    });
  }

  async getOutcomeEvidenceState(executionId: string): Promise<EvidenceState | null> {
    const outcome = await get<Record<string, unknown>>("outcome", executionId);
    return (outcome?.evidenceState as EvidenceState | undefined) ?? null;
  }

  async persistMemory(memory: OperationalMemory, sourceExecutionIds: string[]): Promise<void> {
    if (!sourceExecutionIds.length) throw new Error("Operational memory requires at least one source execution");
    await put("operational_memory", memory.id, {
      ...serializeMemory(memory),
      sourceExecutionIds,
      searchText: `${memory.summary} ${JSON.stringify(memory.structuredContext)}`,
    });
  }

  async getMemory(memoryId: string): Promise<OperationalMemory | null> {
    const raw = await get<Record<string, unknown>>("operational_memory", memoryId);
    return raw ? deserializeMemory(raw) : null;
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
    const retrievalId = randomUUID();
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);
    const rows = await bridge<Array<{ memory: Record<string, unknown>; sibyl: Record<string, unknown> }>>(
      "search_memories",
      { query: input.query, agentId: input.agentId, limit },
    );
    const now = Date.now();
    const candidates = rows
      .map((row, index) => {
        const memory = deserializeMemory(row.memory);
        const context = memory.structuredContext;
        if (input.workflowType && context.workflowType !== input.workflowType) return null;
        if (input.environmentVersion && memory.environmentVersion !== input.environmentVersion) return null;
        if (input.status?.length && !input.status.includes(context.outcome as (typeof input.status)[number])) return null;
        const semanticScore = Math.max(0.55, 1 - index * 0.08);
        const contextScore = input.workflowType && context.workflowType === input.workflowType ? 1 : 0.75;
        const outcomeScore = ["FAILURE", "COMPENSATED", "PARTIAL", "ABORTED", "UNKNOWN"].includes(String(context.outcome ?? "")) ? 1 : 0.5;
        const ageDays = memory.validFrom ? Math.max(0, (now - memory.validFrom.getTime()) / 86_400_000) : 0;
        const recencyScore = Math.max(0, 1 - ageDays / 30);
        const finalScore = scoreMemory({ memory, semanticScore, contextScore, outcomeScore, recencyScore });
        return {
          memoryId: memory.id,
          memory,
          semanticScore,
          contextScore,
          outcomeScore,
          confidenceScore: memory.confidence,
          recencyScore,
          finalScore,
          rank: index + 1,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((value, index) => ({ ...value, rank: index + 1 }))
      .slice(0, limit);

    await put("recall", retrievalId, {
      id: retrievalId,
      executionId: input.executionId,
      query: input.query,
      policyVersion: input.retrievalPolicyVersion ?? "engram-sibyl-v1",
      recalledAt: new Date().toISOString(),
      candidates: candidates.map((candidate) => ({
        memoryId: candidate.memoryId,
        rank: candidate.rank,
        score: candidate.finalScore,
      })),
      rejected: [],
    });
    return { retrievalId, candidates };
  }

  async getRecalls(executionId: string): Promise<MemoryRecall[]> {
    const rows = await list<Record<string, unknown>>("recall");
    return rows
      .filter((row) => row.executionId === executionId)
      .map((row) => ({
        id: String(row.id),
        executionId,
        query: String(row.query),
        policyVersion: String(row.policyVersion ?? "engram-sibyl-v1"),
        recalledAt: new Date(String(row.recalledAt)),
        candidates: ((row.candidates ?? []) as Array<Record<string, unknown>>).map((candidate) => ({
          retrievalId: String(row.id),
          memoryId: String(candidate.memoryId),
          memoryStateDigest: typeof candidate.memoryStateDigest === "string" ? candidate.memoryStateDigest : undefined,
          rank: Number(candidate.rank),
          score: candidate.score === undefined ? undefined : Number(candidate.score),
        })),
      }));
  }

  async updateRecallExposure(update: RecallExposureUpdate): Promise<void> {
    const recall = await get<Record<string, unknown>>("recall", update.retrievalId);
    if (!recall) throw new Error(`Recall ${update.retrievalId} does not exist`);
    const scoreByMemory = new Map(
      ((recall.candidates ?? []) as Array<Record<string, unknown>>).map((candidate) => [String(candidate.memoryId), candidate.score]),
    );
    await put("recall", update.retrievalId, {
      ...recall,
      candidates: update.exposedMemoryStates.map((state, index) => ({
        memoryId: state.memoryId,
        memoryStateDigest: state.memoryStateDigest,
        rank: index + 1,
        score: scoreByMemory.get(state.memoryId),
      })),
      rejected: update.rejected,
    });
  }

  async recordRuntimeDecision(decision: RuntimeDecisionRecord): Promise<void> {
    await put("decision", decision.id, {
      ...decision,
      decidedAt: decision.decidedAt.toISOString(),
    } as unknown as Record<string, unknown>);
  }

  async appendRuntimeEvaluationEvent(event: RuntimeEvaluationEvent): Promise<void> {
    await put("runtime_evaluation", event.id, {
      ...event,
      createdAt: event.createdAt.toISOString(),
    });
  }

  async getTrace(executionId: string): Promise<unknown> {
    const [execution, events, outcome, recalls, decisions, runtimeEvaluations] = await Promise.all([
      this.getExecution(executionId),
      list<Record<string, unknown>>("execution_event"),
      get<Record<string, unknown>>("outcome", executionId),
      this.getRecalls(executionId),
      list<Record<string, unknown>>("decision"),
      list<Record<string, unknown>>("runtime_evaluation"),
    ]);
    return {
      execution,
      events: events.filter((row) => row.executionId === executionId),
      outcome,
      retrievals: recalls,
      decisions: decisions.filter((row) => row.executionId === executionId),
      runtimeEvaluations: runtimeEvaluations.filter((row) => row.executionId === executionId),
      memoryBackend: "sibyl-memory-client",
    };
  }
}
