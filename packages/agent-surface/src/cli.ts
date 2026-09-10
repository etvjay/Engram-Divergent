#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SibylBehavioralMemoryStore } from "../../sibyl/src/behavioral-store.js";
import { createMcpStdioServer } from "./mcp-stdio.js";

const packageDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  process.env.ENGRAM_SIBYL_BRIDGE ??= join(packageDir, "bridge.py");
  const server = createMcpStdioServer({ store: new SibylBehavioralMemoryStore() });
  await server.start();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "MCP launcher failed");
  process.exitCode = 1;
});
