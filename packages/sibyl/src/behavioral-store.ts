import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { BehavioralMemoryEvaluationSchema, type BehavioralMemoryEvaluation } from "../../evaluation/src/memory-evaluation.js";
import { CandidateMemorySchema, type CandidateMemory } from "../../memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema, type ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import { InfluenceGrantSchema, type InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import { MemorySliceSchema, type MemorySlice } from "../../memory-core/src/memory-slice.js";
import { ExecutionEpisodeSchema, type ExecutionEpisode } from "../../experience/src/episode.js";
import { ExecutionSliceSchema, type ExecutionSlice } from "../../experience/src/execution-slice.js";
import { ExperienceSchema, type Experience } from "../../experience/src/experience.js";
import type { BehavioralMemoryGraph, BehavioralMemoryStore } from "../../experience/src/store.js";

function resolveBridgePath(): string {
  return process.env.ENGRAM_SIBYL_BRIDGE ?? resolve(process.cwd(), "packages/sibyl/bridge.py");
}

type BridgeResponse<T> = { ok: true; result: T } | { ok: false; error: { type: string; message: string } };

async function bridge<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const python = process.env.ENGRAM_SIBYL_PYTHON ?? "python3";
  return new Promise<T>((resolveResult, reject) => {
    const child = spawn(python, [resolveBridgePath()], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed: BridgeResponse<T>;
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

async function getRaw(category: string, id: string): Promise<Record<string, unknown> | null> {
  return bridge("get", { category, name: id });
}

async function listRaw(category: string): Promise<Array<Record<string, unknown>>> {
  return bridge("list", { category });
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

async function putImmutable(category: string, id: string, value: unknown): Promise<void> {
  const body = normalize(value) as Record<string, unknown>;
  const existing = await getRaw(category, id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(body)) return;
    throw new Error(`BEHAVIORAL_OBJECT_IDEMPOTENCY_CONFLICT:${category}:${id}`);
  }
  await bridge("put", { category, name: id, body });
}

export class SibylBehavioralMemoryStore implements BehavioralMemoryStore {
  async persistEpisode(value: ExecutionEpisode): Promise<void> {
    await putImmutable("execution_episode", value.id, ExecutionEpisodeSchema.parse(value));
  }
  async getEpisode(id: string): Promise<ExecutionEpisode | null> {
    const raw = await getRaw("execution_episode", id);
    return raw ? ExecutionEpisodeSchema.parse(raw) : null;
  }

  async persistExecutionSlice(value: ExecutionSlice): Promise<void> {
    await putImmutable("execution_slice", value.id, ExecutionSliceSchema.parse(value));
  }
  async getExecutionSlice(id: string): Promise<ExecutionSlice | null> {
    const raw = await getRaw("execution_slice", id);
    return raw ? ExecutionSliceSchema.parse(raw) : null;
  }

  async persistExperience(value: Experience): Promise<void> {
    await putImmutable("experience", value.id, ExperienceSchema.parse(value));
  }
  async getExperience(id: string): Promise<Experience | null> {
    const raw = await getRaw("experience", id);
    return raw ? ExperienceSchema.parse(raw) : null;
  }

  async persistCandidateMemory(value: CandidateMemory): Promise<void> {
    await putImmutable("candidate_memory", value.id, CandidateMemorySchema.parse(value));
  }
  async getCandidateMemory(id: string): Promise<CandidateMemory | null> {
    const raw = await getRaw("candidate_memory", id);
    return raw ? CandidateMemorySchema.parse(raw) : null;
  }

  async persistExecutionMemory(value: ExecutionMemory): Promise<void> {
    await putImmutable("execution_memory", value.id, ExecutionMemorySchema.parse(value));
  }
  async getExecutionMemory(id: string): Promise<ExecutionMemory | null> {
    const raw = await getRaw("execution_memory", id);
    return raw ? ExecutionMemorySchema.parse(raw) : null;
  }

  async persistMemorySlice(value: MemorySlice): Promise<void> {
    await putImmutable("memory_slice", value.id, MemorySliceSchema.parse(value));
  }
  async getMemorySlice(id: string): Promise<MemorySlice | null> {
    const raw = await getRaw("memory_slice", id);
    return raw ? MemorySliceSchema.parse(raw) : null;
  }
  async listMemorySlicesForExecution(executionId: string): Promise<MemorySlice[]> {
    const rows = await listRaw("memory_slice");
    return rows.filter((row) => row.consumerExecutionId === executionId).map((row) => MemorySliceSchema.parse(row));
  }

  async persistInfluenceGrant(value: InfluenceGrant): Promise<void> {
    await putImmutable("influence_grant", value.id, InfluenceGrantSchema.parse(value));
  }
  async getInfluenceGrant(id: string): Promise<InfluenceGrant | null> {
    const raw = await getRaw("influence_grant", id);
    return raw ? InfluenceGrantSchema.parse(raw) : null;
  }
  async listInfluenceGrantsForExecution(executionId: string): Promise<InfluenceGrant[]> {
    const rows = await listRaw("influence_grant");
    return rows.filter((row) => row.consumerExecutionId === executionId).map((row) => InfluenceGrantSchema.parse(row));
  }

  async persistBehavioralEvaluation(value: BehavioralMemoryEvaluation): Promise<void> {
    await putImmutable("behavioral_memory_evaluation", value.id, BehavioralMemoryEvaluationSchema.parse(value));
  }
  async getBehavioralEvaluation(id: string): Promise<BehavioralMemoryEvaluation | null> {
    const raw = await getRaw("behavioral_memory_evaluation", id);
    return raw ? BehavioralMemoryEvaluationSchema.parse(raw) : null;
  }
  async listBehavioralEvaluationsForMemory(executionMemoryId: string): Promise<BehavioralMemoryEvaluation[]> {
    const rows = await listRaw("behavioral_memory_evaluation");
    return rows.filter((row) => row.executionMemoryId === executionMemoryId).map((row) => BehavioralMemoryEvaluationSchema.parse(row));
  }

  async loadBehavioralMemoryGraph(executionMemoryId: string): Promise<BehavioralMemoryGraph> {
    const executionMemory = await this.getExecutionMemory(executionMemoryId);
    if (!executionMemory) throw new Error(`EXECUTION_MEMORY_NOT_FOUND:${executionMemoryId}`);

    const candidateMemory = await this.getCandidateMemory(executionMemory.sourceCandidateMemoryId);
    if (!candidateMemory) throw new Error(`CANDIDATE_MEMORY_NOT_FOUND:${executionMemory.sourceCandidateMemoryId}`);

    const experiences = await Promise.all(executionMemory.sourceExperienceIds.map(async (id) => {
      const value = await this.getExperience(id);
      if (!value) throw new Error(`EXPERIENCE_NOT_FOUND:${id}`);
      return value;
    }));

    const episodeIds = [...new Set(experiences.flatMap((experience) => experience.sourceEpisodeIds))];
    const sliceIds = [...new Set(experiences.flatMap((experience) => experience.sourceSliceIds))];

    const episodes = await Promise.all(episodeIds.map(async (id) => {
      const value = await this.getEpisode(id);
      if (!value) throw new Error(`EPISODE_NOT_FOUND:${id}`);
      return value;
    }));
    const executionSlices = await Promise.all(sliceIds.map(async (id) => {
      const value = await this.getExecutionSlice(id);
      if (!value) throw new Error(`EXECUTION_SLICE_NOT_FOUND:${id}`);
      return value;
    }));

    const allMemorySlices = (await listRaw("memory_slice")).map((row) => MemorySliceSchema.parse(row));
    const memorySlices = allMemorySlices.filter((slice) => slice.executionMemoryIds.includes(executionMemoryId));
    const memorySliceIds = new Set(memorySlices.map((slice) => slice.id));

    const allGrants = (await listRaw("influence_grant")).map((row) => InfluenceGrantSchema.parse(row));
    const influenceGrants = allGrants.filter((grant) => memorySliceIds.has(grant.memorySliceId));
    const evaluations = await this.listBehavioralEvaluationsForMemory(executionMemoryId);

    return { episodes, executionSlices, experiences, candidateMemory, executionMemory, memorySlices, influenceGrants, evaluations };
  }
}
