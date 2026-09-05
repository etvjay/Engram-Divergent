import type { EmbeddingProvider } from "../../memory-core/src/domain.js";

export type OllamaEmbeddingProviderOptions = {
  baseUrl?: string;
  modelId?: string;
  dimensions?: number;
  fetchImpl?: typeof fetch;
};

type OllamaEmbedResponse = {
  embeddings?: unknown;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "OLLAMA" as const;
  readonly dimensions: number;
  readonly modelId: string;
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaEmbeddingProviderOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl
        ?? process.env.OLLAMA_BASE_URL
        ?? process.env.ENGRAM_OLLAMA_URL
        ?? "http://127.0.0.1:11434",
    );
    this.modelId = options.modelId
      ?? process.env.OLLAMA_EMBEDDING_MODEL
      ?? process.env.ENGRAM_OLLAMA_MODEL
      ?? "bge-m3";
    this.dimensions = options.dimensions
      ?? Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS ?? "1024");
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.baseUrl) throw new Error("OLLAMA_BASE_URL must not be empty");
    if (!this.modelId) throw new Error("OLLAMA_EMBEDDING_MODEL must not be empty");
    if (!Number.isInteger(this.dimensions) || this.dimensions <= 0) {
      throw new Error(`Invalid Ollama embedding dimensions: ${this.dimensions}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.modelId,
        input: text,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Ollama embedding request failed (${response.status}): ${detail}`);
    }

    const decoded = await response.json() as OllamaEmbedResponse;
    const embeddings = decoded.embeddings;
    const values = Array.isArray(embeddings) && Array.isArray(embeddings[0])
      ? embeddings[0]
      : null;

    if (!values || values.length !== this.dimensions) {
      throw new Error(`Ollama returned an invalid ${this.dimensions}-dimensional embedding`);
    }

    const vector = values.map(Number);
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error("Ollama embedding contains non-finite values");
    }
    return vector;
  }
}
