import { afterEach, describe, expect, it } from "vitest";
import { getCockroachMcpConfig, getCockroachMcpStatus } from "../../packages/cockroach-mcp/src/client.js";

const originalClusterId = process.env.COCKROACH_MCP_CLUSTER_ID;
const originalApiKey = process.env.COCKROACH_MCP_API_KEY;

afterEach(() => {
  if (originalClusterId === undefined) delete process.env.COCKROACH_MCP_CLUSTER_ID;
  else process.env.COCKROACH_MCP_CLUSTER_ID = originalClusterId;
  if (originalApiKey === undefined) delete process.env.COCKROACH_MCP_API_KEY;
  else process.env.COCKROACH_MCP_API_KEY = originalApiKey;
});

describe("CockroachDB Managed MCP configuration", () => {
  it("does not require MCP credentials for the core Engram runtime", async () => {
    delete process.env.COCKROACH_MCP_CLUSTER_ID;
    delete process.env.COCKROACH_MCP_API_KEY;

    expect(getCockroachMcpConfig()).toBeNull();
    const status = await getCockroachMcpStatus();
    expect(status.configured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.availableTools).toEqual([]);
    expect(status.missingExpectedTools).toContain("select_query");
  });

  it("never includes the API key in the returned configuration status contract", () => {
    process.env.COCKROACH_MCP_CLUSTER_ID = "cluster-demo";
    process.env.COCKROACH_MCP_API_KEY = "do-not-leak";
    const config = getCockroachMcpConfig();
    expect(config?.clusterId).toBe("cluster-demo");
    expect(config?.apiKey).toBe("do-not-leak");
    expect(JSON.stringify({ clusterId: config?.clusterId, url: config?.url })).not.toContain("do-not-leak");
  });
});
