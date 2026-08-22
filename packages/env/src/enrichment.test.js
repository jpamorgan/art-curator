import { describe, expect, test } from "bun:test";

import { ENRICHMENT_EMBEDDING_DIMENSIONS, resolveEnrichmentModelConfig } from "./enrichment";

describe("enrichment model configuration", () => {
  test("defaults to Cloudflare with a stable 768-dimensional generation", () => {
    const first = resolveEnrichmentModelConfig({});
    const second = resolveEnrichmentModelConfig({});
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: "cloudflare",
      visionModel: "@cf/google/gemma-4-26b-a4b-it",
      embeddingModel: "@cf/baai/bge-base-en-v1.5",
      embeddingDimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
    });
    expect(first.vectorGeneration).toMatch(/^eg-[0-9a-f]{16}$/u);
  });

  test("keeps OpenAI optional and changes generation with model or prompt inputs", () => {
    const openai = resolveEnrichmentModelConfig({ ENRICHMENT_PROVIDER: "openai" });
    expect(openai).toMatchObject({
      provider: "openai",
      visionModel: "gpt-5.4-mini-2026-03-17",
      embeddingModel: "text-embedding-3-small",
    });
    expect(
      resolveEnrichmentModelConfig({ ENRICHMENT_PROMPT_VERSION: "artwork-facets-v2" })
        .vectorGeneration,
    ).not.toBe(resolveEnrichmentModelConfig({}).vectorGeneration);
    expect(
      resolveEnrichmentModelConfig({ ENRICHMENT_EMBEDDING_MODEL: "another-model" })
        .vectorGeneration,
    ).not.toBe(resolveEnrichmentModelConfig({}).vectorGeneration);
  });

  test("rejects an unknown provider", () => {
    expect(() => resolveEnrichmentModelConfig({ ENRICHMENT_PROVIDER: "unknown" })).toThrow(
      "Unsupported ENRICHMENT_PROVIDER",
    );
  });
});
