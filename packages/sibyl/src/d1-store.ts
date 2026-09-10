import { BehavioralMemoryEvaluationSchema, type BehavioralMemoryEvaluation } from "../../evaluation/src/memory-evaluation.js";
import { MemoryUpdateRecordSchema, type MemoryUpdateRecord } from "../../evaluation/src/memory-lifecycle.js";
import { CandidateMemorySchema, type CandidateMemory } from "../../memory-core/src/candidate-memory.js";
import { ExecutionMemorySchema, type ExecutionMemory } from "../../memory-core/src/execution-memory.js";
import { InfluenceGrantSchema, type InfluenceGrant } from "../../memory-core/src/influence-grant.js";
import { MemorySliceSchema, type MemorySlice } from "../../memory-core/src/memory-slice.js";
import { ExecutionEpisodeSchema, type ExecutionEpisode } from "../../experience/src/episode.js";
import { ExecutionSliceSchema, type ExecutionSlice } from "../../experience/src/execution-slice.js";
import { ExperienceSchema, type Experience } from "../../experience/src/experience.js";
import type { BehavioralMemoryGraph, BehavioralMemoryStore } from "../../experience/src/store.js";

export interface D1Result<T = unknown> { results: T[]; success: boolean; meta?: Record<string, unknown>; }
export interface D1Statement { bind(...values: unknown[]): D1Statement; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>>; run(): Promise<D1Result>; }
export interface D1Database { prepare(query: string): D1Statement; }

type Row = { value: string };

const TABLE = "engram_objects";
const json = (value: unknown): string => JSON.stringify(value, (_, item) => item instanceof Date ? item.toISOString() : item);

export const ENGRAM_D1_SCHEMA = `CREATE TABLE IF NOT EXISTS ${TABLE} (category TEXT NOT NULL, object_id TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (category, object_id)); CREATE INDEX IF NOT EXISTS idx_engram_objects_category ON ${TABLE}(category);`;

export class D1BehavioralMemoryStore implements BehavioralMemoryStore {
  constructor(private readonly db: D1Database) {}

  private async put(category: string, id: string, value: unknown): Promise<void> {
    const encoded = json(value);
    const existing = await this.db.prepare(`SELECT value FROM ${TABLE} WHERE category = ? AND object_id = ?`).bind(category, id).first<Row>();
    if (existing) {
      if (existing.value === encoded) return;
      throw new Error(`BEHAVIORAL_OBJECT_IDEMPOTENCY_CONFLICT:${category}:${id}`);
    }
    await this.db.prepare(`INSERT INTO ${TABLE} (category, object_id, value) VALUES (?, ?, ?)`).bind(category, id, encoded).run();
  }

  private async get<T>(category: string, id: string, parse: (value: unknown) => T): Promise<T | null> {
    const row = await this.db.prepare(`SELECT value FROM ${TABLE} WHERE category = ? AND object_id = ?`).bind(category, id).first<Row>();
    return row ? parse(JSON.parse(row.value)) : null;
  }

  private async list<T>(category: string, parse: (value: unknown) => T): Promise<T[]> {
    const result = await this.db.prepare(`SELECT value FROM ${TABLE} WHERE category = ? ORDER BY created_at, object_id`).bind(category).all<Row>();
    return result.results.map((row) => parse(JSON.parse(row.value)));
  }

  async persistEpisode(value: ExecutionEpisode) { await this.put("execution_episode", value.id, ExecutionEpisodeSchema.parse(value)); }
  async getEpisode(id: string) { return this.get("execution_episode", id, (v) => ExecutionEpisodeSchema.parse(v)); }
  async persistExecutionSlice(value: ExecutionSlice) { await this.put("execution_slice", value.id, ExecutionSliceSchema.parse(value)); }
  async getExecutionSlice(id: string) { return this.get("execution_slice", id, (v) => ExecutionSliceSchema.parse(v)); }
  async persistExperience(value: Experience) { await this.put("experience", value.id, ExperienceSchema.parse(value)); }
  async getExperience(id: string) { return this.get("experience", id, (v) => ExperienceSchema.parse(v)); }
  async persistCandidateMemory(value: CandidateMemory) { await this.put("candidate_memory", value.id, CandidateMemorySchema.parse(value)); }
  async getCandidateMemory(id: string) { return this.get("candidate_memory", id, (v) => CandidateMemorySchema.parse(v)); }
  async persistExecutionMemory(value: ExecutionMemory) { await this.put("execution_memory", value.id, ExecutionMemorySchema.parse(value)); }
  async getExecutionMemory(id: string) { return this.get("execution_memory", id, (v) => ExecutionMemorySchema.parse(v)); }
  async persistMemorySlice(value: MemorySlice) { await this.put("memory_slice", value.id, MemorySliceSchema.parse(value)); }
  async getMemorySlice(id: string) { return this.get("memory_slice", id, (v) => MemorySliceSchema.parse(v)); }
  async listMemorySlicesForExecution(executionId: string) { return (await this.list("memory_slice", (v) => MemorySliceSchema.parse(v))).filter((v) => v.consumerExecutionId === executionId); }
  async persistInfluenceGrant(value: InfluenceGrant) { await this.put("influence_grant", value.id, InfluenceGrantSchema.parse(value)); }
  async getInfluenceGrant(id: string) { return this.get("influence_grant", id, (v) => InfluenceGrantSchema.parse(v)); }
  async listInfluenceGrantsForExecution(executionId: string) { return (await this.list("influence_grant", (v) => InfluenceGrantSchema.parse(v))).filter((v) => v.consumerExecutionId === executionId); }
  async persistBehavioralEvaluation(value: BehavioralMemoryEvaluation) { await this.put("behavioral_memory_evaluation", value.id, BehavioralMemoryEvaluationSchema.parse(value)); }
  async getBehavioralEvaluation(id: string) { return this.get("behavioral_memory_evaluation", id, (v) => BehavioralMemoryEvaluationSchema.parse(v)); }
  async listBehavioralEvaluationsForMemory(executionMemoryId: string) { return (await this.list("behavioral_memory_evaluation", (v) => BehavioralMemoryEvaluationSchema.parse(v))).filter((v) => v.executionMemoryId === executionMemoryId); }
  async persistMemoryUpdate(value: MemoryUpdateRecord) { await this.put("memory_update", value.id, MemoryUpdateRecordSchema.parse(value)); }
  async listMemoryUpdatesForMemory(executionMemoryId: string) {
    const evaluationIds = new Set((await this.listBehavioralEvaluationsForMemory(executionMemoryId)).map((v) => v.id));
    return (await this.list("memory_update", (v) => MemoryUpdateRecordSchema.parse(v))).filter((v) => evaluationIds.has(v.evaluationId));
  }

  async loadBehavioralMemoryGraph(executionMemoryId: string): Promise<BehavioralMemoryGraph> {
    const executionMemory = await this.getExecutionMemory(executionMemoryId);
    if (!executionMemory) throw new Error(`EXECUTION_MEMORY_NOT_FOUND:${executionMemoryId}`);
    const candidateMemory = await this.getCandidateMemory(executionMemory.sourceCandidateMemoryId);
    if (!candidateMemory) throw new Error(`CANDIDATE_MEMORY_NOT_FOUND:${executionMemory.sourceCandidateMemoryId}`);
    const experiences = await Promise.all(executionMemory.sourceExperienceIds.map(async (id) => {
      const value = await this.getExperience(id); if (!value) throw new Error(`EXPERIENCE_NOT_FOUND:${id}`); return value;
    }));
    const episodeIds = [...new Set(experiences.flatMap((v) => v.sourceEpisodeIds))];
    const sliceIds = [...new Set(experiences.flatMap((v) => v.sourceSliceIds))];
    const episodes = await Promise.all(episodeIds.map(async (id) => { const v = await this.getEpisode(id); if (!v) throw new Error(`EPISODE_NOT_FOUND:${id}`); return v; }));
    const executionSlices = await Promise.all(sliceIds.map(async (id) => { const v = await this.getExecutionSlice(id); if (!v) throw new Error(`EXECUTION_SLICE_NOT_FOUND:${id}`); return v; }));
    const memorySlices = (await this.list("memory_slice", (v) => MemorySliceSchema.parse(v))).filter((v) => v.executionMemoryIds.includes(executionMemoryId));
    const ids = new Set(memorySlices.map((v) => v.id));
    const influenceGrants = (await this.list("influence_grant", (v) => InfluenceGrantSchema.parse(v))).filter((v) => ids.has(v.memorySliceId));
    return { episodes, executionSlices, experiences, candidateMemory, executionMemory, memorySlices, influenceGrants, evaluations: await this.listBehavioralEvaluationsForMemory(executionMemoryId), updates: await this.listMemoryUpdatesForMemory(executionMemoryId) };
  }
}
