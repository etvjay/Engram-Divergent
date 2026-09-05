import { createMcpHandler } from "@modelcontextprotocol/server";
import { getEngramRuntime } from "../../../services/runtime/src/create-runtime.js";
import { createEngramMcpServer } from "./server.js";

/**
 * Web-standard MCP handler for remote hosts. The official MCP v2 handler
 * serves the current protocol and the stateless legacy compatibility path.
 * Authentication/tenant isolation belongs at the hosting boundary.
 */
export function createEngramMcpHttpHandler() {
  return createMcpHandler(() => createEngramMcpServer(getEngramRuntime()));
}
