import type pg from "pg";
import {
  CounterfactualExperimentSchema,
  MEMORY_EVALUATION_SCHEMA_VERSION,
  MemoryEvaluationSchema,
  MemoryRelationshipSchema,
  type CounterfactualExperiment,
  type MemoryEvaluation,
  type MemoryRelationship,
  type MemoryUsefulnessMetrics,
} from "../../evaluation/src/domain.js";
import type { MemoryEvaluationStore } from "../../evaluation/src/store.js";

const json = (value: unknown) => JSON.stringify(value ?? {});

export class CockroachMemoryEvaluationStore implements MemoryEvaluationStore {
  constructor(private readonly pool: pg.Pool) {}

  async recordEvaluation(input: MemoryEvaluation): Promise<void> {
    const evaluation = MemoryEvaluationSchema.parse(input);
    await this.pool.query(
      `INSERT INTO memory_evaluations
        (id, memory_id, influenced_execution_id, influenced_decision_id,
         baseline_execution_id, method, effect, effect_score, rationale,
         evidence_state, controlled_variables, metadata, evaluated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::JSONB,$12::JSONB,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        evaluation.id,
        evaluation.memoryId,
        evaluation.influencedExecutionId,
        evaluation.influencedDecisionId ?? null,
        evaluation.baselineExecutionId ?? null,
        evaluation.method,
        evaluation.effect,
        evaluation.effectScore ?? null,
        evaluation.rationale,
        evaluation.evidenceState,
        json(evaluation.controlledVariables),
        json(evaluation.metadata),
        evaluation.evaluatedAt,
      ],
    );
  }

  async recordRelationship(input: MemoryRelationship): Promise<void> {
    const relationship = MemoryRelationshipSchema.parse(input);
    await this.pool.query(
      `INSERT INTO memory_relationships
        (id, left_memory_id, right_memory_id, relation, rationale,
         evidence_state, method, assessed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        relationship.id,
        relationship.leftMemoryId,
        relationship.rightMemoryId,
        relationship.relation,
        relationship.rationale,
        relationship.evidenceState,
        relationship.method,
        relationship.assessedAt,
      ],
    );
  }

  async recordExperiment(input: CounterfactualExperiment): Promise<void> {
    const experiment = CounterfactualExperimentSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO counterfactual_experiments
          (id, name, control_execution_id, treatment_execution_id,
           controlled_variables, action_changed, control_action, treatment_action,
           control_outcome, treatment_outcome, conclusion, evidence_state, created_at)
         VALUES ($1,$2,$3,$4,$5::JSONB,$6,$7::JSONB,$8::JSONB,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [
          experiment.id,
          experiment.name,
          experiment.controlExecutionId,
          experiment.treatmentExecutionId,
          json(experiment.controlledVariables),
          experiment.actionChanged,
          json(experiment.controlAction),
          json(experiment.treatmentAction),
          experiment.controlOutcome,
          experiment.treatmentOutcome,
          experiment.conclusion,
          experiment.evidenceState,
          experiment.createdAt,
        ],
      );
      for (const memoryId of experiment.influentialMemoryIds) {
        await client.query(
          `INSERT INTO counterfactual_experiment_memories (experiment_id, memory_id)
           VALUES ($1,$2)
           ON CONFLICT (experiment_id, memory_id) DO NOTHING`,
          [experiment.id, memoryId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUsefulnessMetrics(memoryId: string): Promise<MemoryUsefulnessMetrics> {
    const result = await this.pool.query<{
      retrieval_count: string;
      exposed_retrieval_count: string;
      influence_count: string;
      changed_action_count: string;
      considered_count: string;
      explicit_evaluations: string;
      beneficial_evaluations: string;
      harmful_evaluations: string;
      neutral_evaluations: string;
      unknown_evaluations: string;
      controlled_evaluations: string;
      observational_evaluations: string;
    }>(`
      SELECT
        (SELECT count(*) FROM memory_retrieval_results WHERE memory_id=$1) AS retrieval_count,
        (SELECT count(*) FROM memory_retrieval_results WHERE memory_id=$1 AND exposed_to_agent=true) AS exposed_retrieval_count,
        (SELECT count(*) FROM decision_memories WHERE memory_id=$1) AS influence_count,
        (SELECT count(*) FROM decision_memories WHERE memory_id=$1 AND influence_type='CHANGED_ACTION') AS changed_action_count,
        (SELECT count(*) FROM decision_memories WHERE memory_id=$1 AND influence_type='CONSIDERED') AS considered_count,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1) AS explicit_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND effect='BENEFICIAL') AS beneficial_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND effect='HARMFUL') AS harmful_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND effect='NEUTRAL') AS neutral_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND effect='UNKNOWN') AS unknown_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND method IN ('CONTROL_RUN','SHADOW_RUN','REPLAY')) AS controlled_evaluations,
        (SELECT count(*) FROM memory_evaluations WHERE memory_id=$1 AND method='OBSERVATIONAL') AS observational_evaluations
    `, [memoryId]);
    const row = result.rows[0];
    if (!row) throw new Error("Memory usefulness query returned no row");
    return {
      memoryId,
      retrievalCount: Number(row.retrieval_count),
      exposedRetrievalCount: Number(row.exposed_retrieval_count),
      influenceCount: Number(row.influence_count),
      changedActionCount: Number(row.changed_action_count),
      consideredCount: Number(row.considered_count),
      explicitEvaluations: Number(row.explicit_evaluations),
      beneficialEvaluations: Number(row.beneficial_evaluations),
      harmfulEvaluations: Number(row.harmful_evaluations),
      neutralEvaluations: Number(row.neutral_evaluations),
      unknownEvaluations: Number(row.unknown_evaluations),
      controlledEvaluations: Number(row.controlled_evaluations),
      observationalEvaluations: Number(row.observational_evaluations),
    };
  }

  async listEvaluations(memoryId: string): Promise<MemoryEvaluation[]> {
    const result = await this.pool.query<{
      id: string;
      memory_id: string;
      influenced_execution_id: string;
      influenced_decision_id: string | null;
      baseline_execution_id: string | null;
      method: MemoryEvaluation["method"];
      effect: MemoryEvaluation["effect"];
      effect_score: number | null;
      rationale: string;
      evidence_state: MemoryEvaluation["evidenceState"];
      controlled_variables: Record<string, unknown>;
      metadata: Record<string, unknown>;
      evaluated_at: Date;
    }>(
      `SELECT id, memory_id, influenced_execution_id, influenced_decision_id,
              baseline_execution_id, method, effect, effect_score, rationale,
              evidence_state, controlled_variables, metadata, evaluated_at
         FROM memory_evaluations
        WHERE memory_id=$1
        ORDER BY evaluated_at DESC, id DESC`,
      [memoryId],
    );
    return result.rows.map((row) => MemoryEvaluationSchema.parse({
      schemaVersion: MEMORY_EVALUATION_SCHEMA_VERSION,
      id: row.id,
      memoryId: row.memory_id,
      influencedExecutionId: row.influenced_execution_id,
      influencedDecisionId: row.influenced_decision_id ?? undefined,
      baselineExecutionId: row.baseline_execution_id ?? undefined,
      method: row.method,
      effect: row.effect,
      effectScore: row.effect_score ?? undefined,
      rationale: row.rationale,
      evidenceState: row.evidence_state,
      controlledVariables: row.controlled_variables,
      metadata: row.metadata,
      evaluatedAt: row.evaluated_at,
    }));
  }

  async listRelationships(memoryId: string): Promise<MemoryRelationship[]> {
    const result = await this.pool.query<{
      id: string;
      left_memory_id: string;
      right_memory_id: string;
      relation: MemoryRelationship["relation"];
      rationale: string;
      evidence_state: MemoryRelationship["evidenceState"];
      method: MemoryRelationship["method"];
      assessed_at: Date;
    }>(
      `SELECT id, left_memory_id, right_memory_id, relation, rationale,
              evidence_state, method, assessed_at
         FROM memory_relationships
        WHERE left_memory_id=$1 OR right_memory_id=$1
        ORDER BY assessed_at DESC, id DESC`,
      [memoryId],
    );
    return result.rows.map((row) => MemoryRelationshipSchema.parse({
      id: row.id,
      leftMemoryId: row.left_memory_id,
      rightMemoryId: row.right_memory_id,
      relation: row.relation,
      rationale: row.rationale,
      evidenceState: row.evidence_state,
      method: row.method,
      assessedAt: row.assessed_at,
    }));
  }

  async listExperiments(memoryId: string): Promise<CounterfactualExperiment[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      control_execution_id: string;
      treatment_execution_id: string;
      controlled_variables: Record<string, unknown>;
      action_changed: boolean;
      control_action: Record<string, unknown>;
      treatment_action: Record<string, unknown>;
      control_outcome: string;
      treatment_outcome: string;
      conclusion: string;
      evidence_state: CounterfactualExperiment["evidenceState"];
      created_at: Date;
      memory_ids: string[];
    }>(`
      SELECT ce.id, ce.name, ce.control_execution_id, ce.treatment_execution_id,
             ce.controlled_variables, ce.action_changed, ce.control_action,
             ce.treatment_action, ce.control_outcome, ce.treatment_outcome,
             ce.conclusion, ce.evidence_state, ce.created_at,
             array_agg(cem.memory_id ORDER BY cem.memory_id) AS memory_ids
        FROM counterfactual_experiments ce
        JOIN counterfactual_experiment_memories cem ON cem.experiment_id=ce.id
       WHERE EXISTS (
         SELECT 1 FROM counterfactual_experiment_memories target
          WHERE target.experiment_id=ce.id AND target.memory_id=$1
       )
       GROUP BY ce.id
       ORDER BY ce.created_at DESC, ce.id DESC
    `, [memoryId]);

    return result.rows.map((row) => CounterfactualExperimentSchema.parse({
      id: row.id,
      name: row.name,
      controlExecutionId: row.control_execution_id,
      treatmentExecutionId: row.treatment_execution_id,
      influentialMemoryIds: row.memory_ids,
      controlledVariables: row.controlled_variables,
      actionChanged: row.action_changed,
      controlAction: row.control_action,
      treatmentAction: row.treatment_action,
      controlOutcome: row.control_outcome,
      treatmentOutcome: row.treatment_outcome,
      conclusion: row.conclusion,
      evidenceState: row.evidence_state,
      createdAt: row.created_at,
    }));
  }
}
