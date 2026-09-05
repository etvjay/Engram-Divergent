import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { getEngramRuntime } from "../../../services/runtime/src/create-runtime.js";
import { createEngramMcpServer } from "./server.js";

void serveStdio(() => createEngramMcpServer(getEngramRuntime()));
console.error("Engram MCP server running on stdio");
