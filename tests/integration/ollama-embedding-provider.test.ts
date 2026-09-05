import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaEmbeddingProvider } from "../../packages/ollama/src/embeddings.js";
import {
  configuredEmbeddingProviderName,
  createConfiguredEmbeddingProvider,
} from "../../packages/embeddings/src/provider.js";

afterEach(() => {
  delete process.env.ENGRAM_EMBEDDING_PROVIDER;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_EMBEDDING_MODEL;
  delete process.env.OLLAMA_EMBEDDING_DIMENSIONS;
});

describe("OllamaEmbeddingProvider", () => {
  it("requests BGE-M3 embeddings and returns exactly 1024 finite values", async () => {
    const values = Array.from({ length: 1024 }, (_, index) => index / 1024);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:11434/api/embed");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "bge-m3",
        input: "remember this execution",
      });
      return new Response(JSON.stringify({ embeddings: [values] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const provider = new OllamaEmbeddingProvider({ fetchImpl: fetchImpl as typeof fetch });
    const embedding = await provider.embed("remember this execution");

    expect(embedding).toHaveLength(1024);
    expect(provider.provider).toBe("OLLAMA");
    expect(provider.modelId).toBe("bge-m3");
    expect(provider.dimensions).toBe(1024);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed dimensions", async () => {
    const provider = new OllamaEmbeddingProvider({
      fetchImpl: (async () => new Response(JSON.stringify({ embeddings: [[1, 2]] }), { status: 200 })) as typeof fetch,
    });

    await expect(provider.embed("bad response")).rejects.toThrow("invalid 1024-dimensional embedding");
  });

  it("is selectable by the canonical provider factory", () => {
    process.env.ENGRAM_EMBEDDING_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.OLLAMA_EMBEDDING_MODEL = "bge-m3";
    process.env.OLLAMA_EMBEDDING_DIMENSIONS = "1024";

    expect(configuredEmbeddingProviderName()).toBe("ollama");
    const provider = createConfiguredEmbeddingProvider();
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
    expect(provider.provider).toBe("OLLAMA");
    expect(provider.modelId).toBe("bge-m3");
    expect(provider.dimensions).toBe(1024);
  });
});
