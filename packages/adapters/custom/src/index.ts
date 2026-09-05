import type { ExecutionEpisode } from "../../../episode/src/schema.js";
import {
  ENGRAM_ADAPTER_CONTRACT_VERSION,
  assertAdapterMetadata,
  type ExecutionEpisodeAdapter,
} from "../../src/contract.js";

export type CustomAdapterOptions<TSource> = {
  name: string;
  version: string;
  source?: string;
  canAdapt?: (input: unknown) => input is TSource;
  map: (input: TSource) => Promise<ExecutionEpisode> | ExecutionEpisode;
};

/**
 * Bridge arbitrary execution runtimes into the canonical ExecutionEpisode.
 * The mapped result is still validated by adaptExecutionEpisode(), so custom
 * integrations cannot silently redefine Engram protocol semantics.
 */
export function createCustomAdapter<TSource>(
  options: CustomAdapterOptions<TSource>,
): ExecutionEpisodeAdapter<TSource> {
  const metadata = {
    contractVersion: ENGRAM_ADAPTER_CONTRACT_VERSION,
    name: options.name,
    version: options.version,
    source: options.source ?? "custom",
  } as const;
  assertAdapterMetadata(metadata);

  return {
    metadata,
    canAdapt(input: unknown): input is TSource {
      return options.canAdapt ? options.canAdapt(input) : input !== null && typeof input === "object";
    },
    adapt: options.map,
  };
}
