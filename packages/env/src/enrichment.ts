export const ENRICHMENT_EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_ENRICHMENT_PROVIDER = "cloudflare" as const;
export const DEFAULT_ENRICHMENT_PROMPT_VERSION = "artwork-facets-v1";

export type EnrichmentProviderName = "cloudflare" | "openai";

const providerDefaults = {
  cloudflare: {
    visionModel: "@cf/google/gemma-4-26b-a4b-it",
    embeddingModel: "@cf/baai/bge-base-en-v1.5",
  },
  openai: {
    visionModel: "gpt-5.4-mini-2026-03-17",
    embeddingModel: "text-embedding-3-small",
  },
} as const satisfies Record<
  EnrichmentProviderName,
  { visionModel: string; embeddingModel: string }
>;

export type EnrichmentModelConfig = {
  provider: EnrichmentProviderName;
  visionModel: string;
  embeddingModel: string;
  embeddingDimensions: typeof ENRICHMENT_EMBEDDING_DIMENSIONS;
  promptVersion: string;
  vectorGeneration: string;
};

function value(input: Record<string, string | undefined>, key: string) {
  const result = input[key]?.trim();
  return result || undefined;
}

function providerName(input: string | undefined): EnrichmentProviderName {
  if (!input || input === "cloudflare") return "cloudflare";
  if (input === "openai") return input;
  throw new Error(`Unsupported ENRICHMENT_PROVIDER: ${input}`);
}

export function enrichmentVectorGeneration(input: {
  provider: EnrichmentProviderName;
  visionModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  promptVersion: string;
}) {
  const signature = [
    input.provider,
    input.visionModel,
    input.embeddingModel,
    input.embeddingDimensions,
    input.promptVersion,
  ].join("\0");
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(signature)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `eg-${hash.toString(16).padStart(16, "0")}`;
}

export function resolveEnrichmentModelConfig(
  input: Record<string, string | undefined>,
): EnrichmentModelConfig {
  const provider = providerName(value(input, "ENRICHMENT_PROVIDER"));
  const defaults = providerDefaults[provider];
  const visionModel = value(input, "ENRICHMENT_VISION_MODEL") ?? defaults.visionModel;
  const embeddingModel = value(input, "ENRICHMENT_EMBEDDING_MODEL") ?? defaults.embeddingModel;
  const promptVersion =
    value(input, "ENRICHMENT_PROMPT_VERSION") ?? DEFAULT_ENRICHMENT_PROMPT_VERSION;
  const generationInput = {
    provider,
    visionModel,
    embeddingModel,
    embeddingDimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
    promptVersion,
  };
  return {
    ...generationInput,
    embeddingDimensions: ENRICHMENT_EMBEDDING_DIMENSIONS,
    vectorGeneration: enrichmentVectorGeneration(generationInput),
  };
}
