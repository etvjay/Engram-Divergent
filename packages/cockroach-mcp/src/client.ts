import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const DEFAULT_MCP_URL = "https://cockroachlabs.cloud/mcp";
const READ_TOOL_ALLOWLIST = new Set([
  "list_clusters",
  "get_cluster",
  "list_databases",
  "list_tables",
  "get_table_schema",
  "select_query",
  "explain_query",
  "show_running_queries",
]);

export type CockroachMcpConfig = {
  url: string;
  clusterId: string;
  apiKey?: string;
  database?: string;
};

export type CockroachMcpStatus = {
  configured: boolean;
  connected: boolean;
  serverUrl: string;
  clusterId?: string;
  database?: string;
  availableTools: string[];
  readTools: string[];
  missingExpectedTools: string[];
};

export function getCockroachMcpConfig(): CockroachMcpConfig | null {
  const clusterId = process.env.COCKROACH_MCP_CLUSTER_ID?.trim();
  if (!clusterId) return null;

  return {
    url: process.env.COCKROACH_MCP_URL?.trim() || DEFAULT_MCP_URL,
    clusterId,
    apiKey: process.env.COCKROACH_MCP_API_KEY?.trim() || undefined,
    database: process.env.COCKROACH_MCP_DATABASE?.trim() || undefined,
  };
}

function withCockroachHeaders(config: CockroachMcpConfig): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("mcp-cluster-id", config.clusterId);
    if (config.apiKey) headers.set("authorization", `Bearer ${config.apiKey}`);
    return fetch(input, { ...init, headers });
  };
}

function buildArgsFromSchema(
  inputSchema: unknown,
  values: { sql?: string; database?: string; table?: string },
): Record<string, unknown> {
  const schema = inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  const keys = Object.keys(schema.properties ?? {});
  const args: Record<string, unknown> = {};

  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    if ((normalized === "query" || normalized === "sql" || normalized === "statement") && values.sql) args[key] = values.sql;
    if ((normalized === "database" || normalized === "databasename" || normalized === "dbname") && values.database) args[key] = values.database;
    if ((normalized === "table" || normalized === "tablename") && values.table) args[key] = values.table;
  }

  const unresolved = (schema.required ?? []).filter((key) => args[key] === undefined);
  if (unresolved.length) throw new Error(`Unable to map required MCP tool arguments: ${unresolved.join(", ")}`);
  return args;
}

export class CockroachManagedMcpClient {
  private readonly client = new Client({ name: "engram", version: "0.1.0" });
  private connected = false;

  constructor(private readonly config: CockroachMcpConfig) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
      fetch: withCockroachHeaders(this.config),
    });
    await this.client.connect(transport);
    this.connected = true;
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }

  async status(): Promise<CockroachMcpStatus> {
    await this.connect();
    const tools = await this.client.listTools();
    const availableTools = tools.tools.map((tool) => tool.name).sort();
    const readTools = availableTools.filter((name) => READ_TOOL_ALLOWLIST.has(name));
    const expected = ["list_databases", "list_tables", "get_table_schema", "select_query", "explain_query"];

    return {
      configured: true,
      connected: true,
      serverUrl: this.config.url,
      clusterId: this.config.clusterId,
      database: this.config.database,
      availableTools,
      readTools,
      missingExpectedTools: expected.filter((name) => !availableTools.includes(name)),
    };
  }

  async callReadTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!READ_TOOL_ALLOWLIST.has(name)) throw new Error(`MCP tool ${name} is not permitted by Engram's read-only MCP policy`);
    await this.connect();
    const tools = await this.client.listTools();
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`MCP tool ${name} is not exposed by the connected CockroachDB server`);
    return this.client.callTool({ name, arguments: args });
  }

  async inspectMemoryProvenance(memoryId: string): Promise<unknown> {
    if (!/^[0-9a-fA-F-]{36}$/.test(memoryId)) throw new Error("memoryId must be a UUID");
    await this.connect();
    const tools = await this.client.listTools();
    const tool = tools.tools.find((candidate) => candidate.name === "select_query");
    if (!tool) throw new Error("CockroachDB Managed MCP select_query tool is unavailable");

    const sql = `
      SELECT
        m.id AS memory_id,
        m.summary AS memory_summary,
        ms.execution_id AS source_execution_id,
        d.id AS influenced_decision_id,
        dm.influence_type,
        dm.influence_summary,
        dm.relevance
      FROM memories AS m
      JOIN memory_sources AS ms ON ms.memory_id = m.id
      LEFT JOIN decision_memories AS dm ON dm.memory_id = m.id
      LEFT JOIN decisions AS d ON d.id = dm.decision_id
      WHERE m.id = '${memoryId}'::UUID
      ORDER BY d.created_at ASC
      LIMIT 25
    `;

    const args = buildArgsFromSchema(tool.inputSchema, { sql, database: this.config.database });
    return this.client.callTool({ name: "select_query", arguments: args });
  }
}

export async function getCockroachMcpStatus(): Promise<CockroachMcpStatus> {
  const config = getCockroachMcpConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      serverUrl: DEFAULT_MCP_URL,
      availableTools: [],
      readTools: [],
      missingExpectedTools: ["list_databases", "list_tables", "get_table_schema", "select_query", "explain_query"],
    };
  }

  const client = new CockroachManagedMcpClient(config);
  try {
    return await client.status();
  } finally {
    await client.close();
  }
}

export async function inspectMemoryProvenanceViaMcp(memoryId: string): Promise<unknown> {
  const config = getCockroachMcpConfig();
  if (!config) throw new Error("CockroachDB Managed MCP is not configured");
  const client = new CockroachManagedMcpClient(config);
  try {
    return await client.inspectMemoryProvenance(memoryId);
  } finally {
    await client.close();
  }
}
