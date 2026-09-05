import { describe, expect, it, vi } from "vitest";
import { VertexEmbeddingProvider } from "../../packages/vertex/src/embeddings.js";

describe("VertexEmbeddingProvider", () => {
  it("requests a 1024-dimensional retrieval embedding and returns finite values", async () => {
    const values = Array.from({ length: 1024 }, (_, index) => index / 1024);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.instances).toEqual([{ content: "remember this", task_type: "RETRIEVAL_DOCUMENT" }]);
      expect(body.parameters).toEqual({ outputDimensionality: 1024 });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
      return new Response(JSON.stringify({ predictions: [{ embeddings: { values } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const provider = new VertexEmbeddingProvider({
      projectId: "engram-test",
      location: "us-central1",
      modelId: "gemini-embedding-001",
      accessTokenProvider: async () => "test-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const embedding = await provider.embed("remember this");
    expect(embedding).toHaveLength(1024);
    expect(provider.provider).toBe("GOOGLE_VERTEX_AI");
    expect(provider.modelId).toBe("gemini-embedding-001");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails closed on a malformed embedding response", async () => {
    const provider = new VertexEmbeddingProvider({
      projectId: "engram-test",
      accessTokenProvider: async () => "test-token",
      fetchImpl: (async () => new Response(JSON.stringify({ predictions: [{ embeddings: { values: [1, 2] } }] }), { status: 200 })) as typeof fetch,
    });

    await expect(provider.embed("bad response")).rejects.toThrow("invalid 1024-dimensional embedding");
  });
});
