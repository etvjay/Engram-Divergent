import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { OperationalMemory } from "../../packages/memory-core/src/domain.js";
import type { RuntimeRecallResult } from "../../packages/runtime/src/types.js";
import { createEngramMcpServer, type EngramMcpRuntime } from "../../packages/mcp-server/src/server.js";

class FakeRuntime implements EngramMcpRuntime {
  readonly executionId = randomUUID();
  readonly memoryId = randomUUID();
  recalls = 0;

  async trace(executionId: string) {
    return {
      execution: { id: executionId },
      retrievals: [{ id: "r1" }],
      decisions: [{ id: "d1", memory_influences: [{ memory_id: this.memoryId, influence_type: "CHANGED_ACTION" }] }],
      runtimeEvaluations: [{ eventType: "INFLUENCE_ACCEPTED" }],
      outcome: { status: "SUCCESS" },
    };
  }

  async inspectMemory(memoryId: string): Promise<OperationalMemory | null> {
    if (memoryId !== this.memoryId) return null;
    return {
      id: memoryId,
      agentId: "mcp-agent",
      memoryType: "UNEXPECTED_FAILURE",
      summary: "A prior execution failed under comparable conditions.",
      structuredContext: { workflowType: "deployment" },
      confidence: 0.92,
      evidenceState: "OBSERVED",
      validFrom: new Date(),
    };
  }

  async compareExecutions(leftExecutionId: string, rightExecutionId: string) {
    return {
      left: await this.trace(leftExecutionId),
      right: await this.trace(rightExecutionId),
    };
  }

  async recall(input: { executionId: string; query: string }): Promise<RuntimeRecallResult> {
    this.recalls += 1;
    return {
      recall: {
        id: randomUUID(),
        executionId: input.executionId,
        query: input.query,
        policyVersion: "engram-retrieval-v1",
        recalledAt: new Date(),
        candidates: [{ retrievalId: randomUUID(), memoryId: this.memoryId, rank: 1, score: 0.91 }],
      },
      candidates: [],
      rejected: [],
    };
  }
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

async function connect(runtime: EngramMcpRuntime) {
  const server = createEngramMcpServer(runtime);
  const client = new Client({ name: "engram-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("Engram MCP", () => {
  it("advertises semantic execution-memory tools", async () => {
    const client = await connect(new FakeRuntime());
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      "inspect_execution",
      "inspect_memory",
      "recall_execution_memory",
      "explain_memory_influence",
      "compare_executions",
    ]));
  });

  it("persists recall through the runtime instead of presenting retrieval as influence", async () => {
    const runtime = new FakeRuntime();
    const client = await connect(runtime);

    const response = await client.callTool({
      name: "recall_execution_memory",
      arguments: { executionId: runtime.executionId, query: "comparable deployment failures" },
    });

    expect(response.isError).not.toBe(true);
    expect(runtime.recalls).toBe(1);
    expect(JSON.stringify(response.content)).toContain(runtime.memoryId);
  });

  it("returns the explicit memory-to-action evidence surface", async () => {
    const runtime = new FakeRuntime();
    const client = await connect(runtime);

    const response = await client.callTool({
      name: "explain_memory_influence",
      arguments: { executionId: runtime.executionId },
    });

    const text = JSON.stringify(response.content);
    expect(text).toContain("CHANGED_ACTION");
    expect(text).toContain("INFLUENCE_ACCEPTED");
    expect(text).toContain("SUCCESS");
  });
});
