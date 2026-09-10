import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";
import { createMcpStdioServer } from "../packages/agent-surface/src/mcp-stdio.js";

// No credentials are read at startup. Sibyl configuration is injected by env/runtime.
const server = createMcpStdioServer({ store: new SibylBehavioralMemoryStore() });
await server.start();
