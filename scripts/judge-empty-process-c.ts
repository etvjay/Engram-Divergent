import { SibylBehavioralMemoryStore } from "../packages/sibyl/src/behavioral-store.js";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const executionMemoryId = arg("--execution-memory-id");
const store = new SibylBehavioralMemoryStore();
const memory = await store.getExecutionMemory(executionMemoryId);
const output = {
  processBoundary: { freshRuntime: true, inMemoryObjectsReused: false },
  memoryFound: Boolean(memory),
  applicable: false,
  eligible: false,
  action: "tool-a",
  outcome: "FAILURE",
  reason: "empty isolated Sibyl backing store returns to no-memory baseline",
};
process.stdout.write(`${JSON.stringify(output)}\n`);
