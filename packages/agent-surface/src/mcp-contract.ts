import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const ToolNameSchema = z.enum([
  "record_complete_execution",
  "recall_applicable_memory",
  "request_influence",
  "submit_outcome_evaluation",
  "get_evaluation_summary",
  "compare_arms",
  "get_memory_update_history",
  "get_authority_boundary_metrics",
  "get_use_case_scorecard",
  "get_evidence_receipt",
]);

const RecordExecutionInputSchema = z.object({
  execution: JsonObjectSchema,
  events: z.array(JsonObjectSchema).max(1000).optional(),
  outcome: JsonObjectSchema,
  evidenceRefs: z.array(z.string().min(1).max(500)).max(100).optional(),
  subject: z.string().min(1).max(200).optional(),
  fields: JsonObjectSchema.optional(),
  observation: z.string().min(1).max(10000).optional(),
  interpretation: z.string().min(1).max(10000).optional(),
  applicability: JsonObjectSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  memoryType: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(10000).optional(),
}).strict();

const RecallInputSchema = z.object({
  executionMemoryId: z.string().uuid(),
  consumerAgentId: z.string().min(1).max(200),
  consumerExecutionId: z.string().uuid(),
  context: JsonObjectSchema.optional(),
  purpose: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(200).optional(),
}).strict();

const RequestInfluenceInputSchema = z.object({
  influenceGrantId: z.string().uuid(),
  consumerAgentId: z.string().min(1).max(200),
  proposal: JsonObjectSchema,
}).strict();

const SubmitEvaluationInputSchema = z.object({
  evaluation: JsonObjectSchema,
}).strict();
const EvidenceReceiptInputSchema = z.object({ runId: z.string().min(1).max(200).optional() }).strict();

export const TOOL_INPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  record_complete_execution: { type: "object", additionalProperties: false, required: ["execution", "outcome"], properties: { execution: { type: "object" }, events: { type: "array", maxItems: 1000 }, outcome: { type: "object" }, evidenceRefs: { type: "array", items: { type: "string" }, maxItems: 100 }, subject: { type: "string" }, fields: { type: "object" }, observation: { type: "string" }, interpretation: { type: "string" }, applicability: { type: "object" }, confidence: { type: "number", minimum: 0, maximum: 1 }, memoryType: { type: "string" }, summary: { type: "string" } } },
  recall_applicable_memory: { type: "object", additionalProperties: false, required: ["executionMemoryId", "consumerAgentId", "consumerExecutionId"], properties: { executionMemoryId: { type: "string", format: "uuid" }, consumerAgentId: { type: "string" }, consumerExecutionId: { type: "string", format: "uuid" }, context: { type: "object" }, purpose: { type: "string" }, subject: { type: "string" } } },
  request_influence: { type: "object", additionalProperties: false, required: ["influenceGrantId", "consumerAgentId", "proposal"], properties: { influenceGrantId: { type: "string", format: "uuid" }, consumerAgentId: { type: "string" }, proposal: { type: "object" } } },
  submit_outcome_evaluation: { type: "object", additionalProperties: false, required: ["evaluation"], properties: { evaluation: { type: "object" } } },
};

export function validateToolArguments(name: string, input: unknown): Record<string, unknown> {
  const value = input ?? {};
  switch (name) {
    case "record_complete_execution": return RecordExecutionInputSchema.parse(value);
    case "recall_applicable_memory": return RecallInputSchema.parse(value);
    case "request_influence": return RequestInfluenceInputSchema.parse(value);
    case "submit_outcome_evaluation": return SubmitEvaluationInputSchema.parse(value);
    case "get_evidence_receipt": return EvidenceReceiptInputSchema.parse(value);
    default: return z.object({}).strict().parse(value);
  }
}

export function mcpError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown } {
  const error = new Error(message) as Error & { code: string; details?: unknown };
  error.code = code;
  error.details = details;
  return error;
}
