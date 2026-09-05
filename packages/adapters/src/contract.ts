import {
  ExecutionEpisodeSchema,
  type ExecutionEpisode,
} from "../../episode/src/schema.js";

export const ENGRAM_ADAPTER_CONTRACT_VERSION = "engram.adapter/v1" as const;

export type AdapterMetadata = {
  contractVersion: typeof ENGRAM_ADAPTER_CONTRACT_VERSION;
  name: string;
  version: string;
  source: string;
};

export interface ExecutionEpisodeAdapter<TSource> {
  readonly metadata: AdapterMetadata;
  canAdapt(input: unknown): input is TSource;
  adapt(input: TSource): Promise<ExecutionEpisode> | ExecutionEpisode;
}

export async function adaptExecutionEpisode<TSource>(
  adapter: ExecutionEpisodeAdapter<TSource>,
  input: unknown,
): Promise<ExecutionEpisode> {
  if (!adapter.canAdapt(input)) {
    throw new Error(`Adapter ${adapter.metadata.name} cannot adapt the supplied source execution`);
  }

  const episode = await adapter.adapt(input);
  return ExecutionEpisodeSchema.parse(episode);
}

export function assertAdapterMetadata(metadata: AdapterMetadata): void {
  if (metadata.contractVersion !== ENGRAM_ADAPTER_CONTRACT_VERSION) {
    throw new Error(`Unsupported Engram adapter contract: ${metadata.contractVersion}`);
  }
  if (!metadata.name.trim()) throw new Error("Adapter name is required");
  if (!metadata.version.trim()) throw new Error("Adapter version is required");
  if (!metadata.source.trim()) throw new Error("Adapter source is required");
}
