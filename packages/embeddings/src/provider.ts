import type { EmbeddingProvider } from "../../memory-core/src/domain.js";
import { TitanEmbeddingProvider } from "../../bedrock/src/embeddings.js";
import { OllamaEmbeddingProvider } from "../../ollama/src/embeddings.js";
import { VertexEmbeddingProvider } from "../../vertex/src/embeddings.js";

export type EmbeddingProviderName = "bedrock" | "ollama" | "vertex";

export type ConfiguredEmbeddingProvider = EmbeddingProvider & {
  readonly provider: string;
  readonly modelId: string;
};

export function configuredEmbeddingProviderName(): EmbeddingProviderName {
  const raw = (process.env.ENGRAM_EMBEDDING_PROVIDER ?? "bedrock").trim().toLowerCase();
  if (raw === "bedrock" || raw === "ollama" || raw === "vertex") return raw;
  throw new Error(`Unsupported ENGRAM_EMBEDDING_PROVIDER: ${raw}`);
}

export function createConfiguredEmbeddingProvider(): ConfiguredEmbeddingProvider {
  const provider = configuredEmbeddingProviderName();
  if (provider === "vertex") return new VertexEmbeddingProvider();
  if (provider === "ollama") return new OllamaEmbeddingProvider();
  return new TitanEmbeddingProvider();
}
