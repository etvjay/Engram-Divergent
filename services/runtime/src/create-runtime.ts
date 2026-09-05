import { createCockroachPool } from "../../../packages/cockroach/src/client.js";
import { AtomicCockroachRuntimeStore } from "../../../packages/cockroach/src/atomic-runtime-store.js";
import { CockroachMemoryPolicyRegistry } from "../../../packages/cockroach/src/policy-registry.js";
import { CockroachMemoryRepository } from "../../../packages/cockroach/src/repository.js";
import { createConfiguredEmbeddingProvider } from "../../../packages/embeddings/src/provider.js";
import { DEFAULT_RUNTIME_POLICIES } from "../../../packages/runtime/src/defaults.js";
import { EngramRuntime } from "../../../packages/runtime/src/runtime.js";
import type { RuntimePolicyBundle } from "../../../packages/runtime/src/types.js";

let runtime: EngramRuntime | undefined;

export function createEngramRuntime(policies: RuntimePolicyBundle = DEFAULT_RUNTIME_POLICIES): EngramRuntime {
  const pool = createCockroachPool();
  const repository = new CockroachMemoryRepository(pool, createConfiguredEmbeddingProvider());
  const store = new AtomicCockroachRuntimeStore(pool, repository);
  const policyRegistry = new CockroachMemoryPolicyRegistry(pool);
  return new EngramRuntime(store, policies, policyRegistry);
}

export function getEngramRuntime(): EngramRuntime {
  if (!runtime) runtime = createEngramRuntime();
  return runtime;
}
