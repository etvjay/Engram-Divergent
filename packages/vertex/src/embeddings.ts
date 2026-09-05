import { GoogleAuth } from "google-auth-library";
import type { EmbeddingProvider } from "../../memory-core/src/domain.js";

export type VertexEmbeddingProviderOptions = {
  projectId?: string;
  location?: string;
  modelId?: string;
  dimensions?: number;
  taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" | "CLASSIFICATION" | "CLUSTERING";
  accessTokenProvider?: () => Promise<string>;
  fetchImpl?: typeof fetch;
};

type VertexPredictionResponse = {
  predictions?: Array<{
    embeddings?: {
      values?: unknown;
      statistics?: unknown;
    };
  }>;
};

async function defaultAccessTokenProvider(): Promise<string> {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Google Application Default Credentials did not return an access token");
  return token;
}

export class VertexEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "GOOGLE_VERTEX_AI" as const;
  readonly dimensions: number;
  readonly projectId: string;
  readonly location: string;
  readonly modelId: string;
  readonly taskType: VertexEmbeddingProviderOptions["taskType"];
  private readonly accessTokenProvider: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VertexEmbeddingProviderOptions = {}) {
    this.projectId = options.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
    this.location = options.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
    this.modelId = options.modelId ?? process.env.VERTEX_EMBEDDING_MODEL ?? "gemini-embedding-001";
    this.dimensions = options.dimensions ?? Number(process.env.VERTEX_EMBEDDING_DIMENSIONS ?? "1024");
    this.taskType = options.taskType ?? "RETRIEVAL_DOCUMENT";
    this.accessTokenProvider = options.accessTokenProvider ?? defaultAccessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.projectId) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI embeddings");
    if (!Number.isInteger(this.dimensions) || this.dimensions <= 0 || this.dimensions > 3072) {
      throw new Error(`Invalid Vertex embedding dimensions: ${this.dimensions}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    const token = await this.accessTokenProvider();
    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.location)}/publishers/google/models/${encodeURIComponent(this.modelId)}:predict`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ content: text, task_type: this.taskType }],
        parameters: { outputDimensionality: this.dimensions },
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Vertex AI embedding request failed (${response.status}): ${detail}`);
    }

    const decoded = await response.json() as VertexPredictionResponse;
    const values = decoded.predictions?.[0]?.embeddings?.values;
    if (!Array.isArray(values) || values.length !== this.dimensions) {
      throw new Error(`Vertex AI returned an invalid ${this.dimensions}-dimensional embedding`);
    }

    const vector = values.map(Number);
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error("Vertex AI embedding contains non-finite values");
    }
    return vector;
  }
}
