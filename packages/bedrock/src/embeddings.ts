import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { EmbeddingProvider } from "../../memory-core/src/domain.js";

export class TitanEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  readonly provider = "AWS_BEDROCK" as const;
  readonly modelId: string;
  readonly region: string;
  private readonly client: BedrockRuntimeClient;

  constructor(
    region = process.env.AWS_REGION ?? "us-east-1",
    modelId = process.env.BEDROCK_EMBEDDING_MODEL ?? "amazon.titan-embed-text-v2:0",
  ) {
    this.region = region;
    this.modelId = modelId;
    this.client = new BedrockRuntimeClient({ region });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.send(new InvokeModelCommand({
      modelId: this.modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text, dimensions: this.dimensions, normalize: true }),
    }));

    const decoded = JSON.parse(new TextDecoder().decode(response.body)) as { embedding?: unknown };
    if (!Array.isArray(decoded.embedding) || decoded.embedding.length !== this.dimensions) {
      throw new Error(`Bedrock returned an invalid ${this.dimensions}-dimensional embedding`);
    }
    const vector = decoded.embedding.map(Number);
    if (vector.some((value) => !Number.isFinite(value))) throw new Error("Bedrock embedding contains non-finite values");
    return vector;
  }
}
