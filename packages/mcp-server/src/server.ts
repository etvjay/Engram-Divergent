import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { OperationalMemory } from "../../memory-core/src/domain.js";
import type { RuntimeRecallResult } from "../../runtime/src/types.js";

export interface EngramMcpRuntime {
  trace(executionId: string): Promise<unknown>;
  inspectMemory(memoryId: string): Promise<OperationalMemory | null>;
  compareExecutions(leftExecutionId: string, rightExecutionId: string): Promise<{ left: unknown; right: unknown }>;
  recall(input: {
    executionId: string;
    query: string;
    status?: Array<"SUCCESS" | "FAILURE" | "PARTIAL" | "COMPENSATED" | "ABORTED" | "UNKNOWN">;
  }): Promise<RuntimeRecallResult>;
}

const ExecutionIdSchema = z.string().uuid().describe("Engram execution UUID");
const MemoryIdSchema = z.string().uuid().describe("Engram operational-memory UUID");
const OutcomeStatusSchema = z.enum(["SUCCESS", "FAILURE", "PARTIAL", "COMPENSATED", "ABORTED", "UNKNOWN"]);

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function extractInfluenceTrace(trace: unknown) {
  if (!trace || typeof trace !== "object") return { trace };
  const record = trace as Record<string, unknown>;
  return {
    execution: record.execution ?? null,
    retrievals: record.retrievals ?? [],
    decisions: record.decisions ?? [],
    runtimeEvaluations: record.runtimeEvaluations ?? [],
    outcome: record.outcome ?? null,
  };
}

export function createEngramMcpServer(runtime: EngramMcpRuntime): McpServer {
  const server = new McpServer(
    { name: "engram", version: "0.1.0" },
    {
      instructions:
        "Engram is execution-memory infrastructure. Retrieval is not proof of influence. Use inspect_execution or explain_memory_influence to verify provenance before claiming that memory changed an action. recall_execution_memory is only valid for an existing RUNNING execution and records the recall in Engram.",
    },
  );

  server.registerTool(
    "inspect_execution",
    {
      title: "Inspect Engram Execution",
      description: "Inspect an execution trace including evidence, recalls, decisions, outcomes, and runtime memory-policy evaluations.",
      inputSchema: z.object({ executionId: ExecutionIdSchema }),
    },
    async ({ executionId }) => result(await runtime.trace(executionId)),
  );

  server.registerTool(
    "inspect_memory",
    {
      title: "Inspect Operational Memory",
      description: "Inspect one operational memory and its evidence, confidence, validity, environment, tool, and policy metadata.",
      inputSchema: z.object({ memoryId: MemoryIdSchema }),
    },
    async ({ memoryId }) => {
      const memory = await runtime.inspectMemory(memoryId);
      if (!memory) {
        return {
          content: [{ type: "text" as const, text: `Operational memory ${memoryId} does not exist.` }],
          isError: true,
        };
      }
      return result(memory);
    },
  );

  server.registerTool(
    "recall_execution_memory",
    {
      title: "Recall Execution Memory",
      description: "Recall policy-eligible operational memories for an existing RUNNING execution. The recall is persisted but does not imply that any returned memory influenced a decision.",
      inputSchema: z.object({
        executionId: ExecutionIdSchema,
        query: z.string().min(1).describe("Operational experience relevant to the current decision context"),
        status: z.array(OutcomeStatusSchema).optional().describe("Optional source-outcome filter"),
      }),
    },
    async ({ executionId, query, status }) => result(await runtime.recall({ executionId, query, status })),
  );

  server.registerTool(
    "explain_memory_influence",
    {
      title: "Explain Memory Influence",
      description: "Reconstruct the recall → memory → decision → counterfactual → outcome evidence for an execution. Use this instead of inferring influence from retrieval alone.",
      inputSchema: z.object({ executionId: ExecutionIdSchema }),
    },
    async ({ executionId }) => result(extractInfluenceTrace(await runtime.trace(executionId))),
  );

  server.registerTool(
    "compare_executions",
    {
      title: "Compare Engram Executions",
      description: "Compare two execution traces, including their recalls, memory influences, counterfactuals, runtime evaluations, and outcomes.",
      inputSchema: z.object({
        leftExecutionId: ExecutionIdSchema,
        rightExecutionId: ExecutionIdSchema,
      }),
    },
    async ({ leftExecutionId, rightExecutionId }) => result(
      await runtime.compareExecutions(leftExecutionId, rightExecutionId),
    ),
  );

  return server;
}
