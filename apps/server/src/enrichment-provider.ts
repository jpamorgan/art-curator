import { z } from "zod";

export type EnrichmentModelConfig = {
  provider: "cloudflare" | "openai";
  visionModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  promptVersion: string;
  vectorGeneration: string;
};

export const visualFacetsSchema = z
  .object({
    palette: z.array(z.string().trim().min(1).max(80)).max(8),
    temperature: z.enum(["warm", "cool", "neutral", "mixed"]),
    brightness: z.enum(["dark", "mid-tone", "bright", "mixed"]),
    subjects: z.array(z.string().trim().min(1).max(100)).max(12),
    setting: z.array(z.string().trim().min(1).max(100)).max(8),
    mood: z.array(z.string().trim().min(1).max(100)).max(8),
    composition: z.array(z.string().trim().min(1).max(100)).max(8),
    textureAndMarkMaking: z.array(z.string().trim().min(1).max(100)).max(8),
    abstraction: z.enum(["representational", "semi-abstract", "abstract", "non-objective"]),
    visualDensity: z.enum(["sparse", "moderate", "dense"]),
    motifs: z.array(z.string().trim().min(1).max(100)).max(12),
    visualDescription: z.string().trim().min(1).max(800),
  })
  .strict();

export type VisualFacets = z.infer<typeof visualFacetsSchema>;

export const visualFacetJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "palette",
    "temperature",
    "brightness",
    "subjects",
    "setting",
    "mood",
    "composition",
    "textureAndMarkMaking",
    "abstraction",
    "visualDensity",
    "motifs",
    "visualDescription",
  ],
  properties: {
    palette: { type: "array", items: { type: "string" }, maxItems: 8 },
    temperature: { type: "string", enum: ["warm", "cool", "neutral", "mixed"] },
    brightness: { type: "string", enum: ["dark", "mid-tone", "bright", "mixed"] },
    subjects: { type: "array", items: { type: "string" }, maxItems: 12 },
    setting: { type: "array", items: { type: "string" }, maxItems: 8 },
    mood: { type: "array", items: { type: "string" }, maxItems: 8 },
    composition: { type: "array", items: { type: "string" }, maxItems: 8 },
    textureAndMarkMaking: { type: "array", items: { type: "string" }, maxItems: 8 },
    abstraction: {
      type: "string",
      enum: ["representational", "semi-abstract", "abstract", "non-objective"],
    },
    visualDensity: { type: "string", enum: ["sparse", "moderate", "dense"] },
    motifs: { type: "array", items: { type: "string" }, maxItems: 12 },
    visualDescription: { type: "string", maxLength: 800 },
  },
} as const;

export type ArtworkFacetInput = {
  imageBytes: Uint8Array;
  metadata: {
    title: string;
    artist: string;
    medium: string;
    date: string;
  };
};

export type EnrichmentProvider = {
  config: EnrichmentModelConfig;
  analyzeArtwork(input: ArtworkFacetInput): Promise<VisualFacets>;
  embedText(text: string): Promise<number[]>;
};

export type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

type ProviderOptions = {
  config: EnrichmentModelConfig;
  workersAi?: WorkersAiBinding;
  openAiApiKey?: string;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function validateEmbedding(value: unknown, config: EnrichmentModelConfig) {
  const parsed = z.array(z.number()).safeParse(value);
  if (
    !parsed.success ||
    parsed.data.length !== config.embeddingDimensions ||
    parsed.data.some((entry) => !Number.isFinite(entry))
  )
    throw new Error(
      `${config.provider} returned an invalid ${config.embeddingDimensions}-dimensional embedding.`,
    );
  return parsed.data;
}

function parseFacets(value: unknown, provider: string) {
  let candidate = value;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
    const jsonText = fenced ?? trimmed;
    try {
      candidate = JSON.parse(jsonText);
    } catch {
      const start = jsonText.indexOf("{");
      const end = jsonText.lastIndexOf("}");
      try {
        if (start < 0 || end <= start) throw new Error("missing JSON object");
        candidate = JSON.parse(jsonText.slice(start, end + 1));
      } catch {
        throw new Error(`${provider} returned invalid artwork facet JSON.`);
      }
    }
  }
  const parsed = visualFacetsSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(`${provider} returned invalid artwork facets.`);
  return parsed.data;
}

function extractCloudflareResponse(payload: unknown) {
  const response = payload as {
    response?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = response.choices?.[0]?.message?.content;
  const messageText = Array.isArray(content)
    ? (content as Array<{ type?: string; text?: unknown }>).find(
        (part) => part.type === "text" && part.text !== undefined,
      )?.text
    : content;
  const value = response.response ?? messageText;
  if (value === undefined) throw new Error("Cloudflare returned no artwork facet response.");
  return value;
}

async function boundedOpenAiRequest(
  path: string,
  body: unknown,
  options: ProviderOptions & { openAiApiKey: string },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs ?? 60_000);
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI ${path} failed with HTTP ${response.status}.`);
    const maximumBytes = 2 * 1_024 * 1_024;
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
      throw new Error(`OpenAI ${path} response exceeded the size limit.`);
    if (!response.body) throw new Error(`OpenAI ${path} returned an empty response.`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error(`OpenAI ${path} response exceeded the size limit.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiResponse(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  for (const output of response.output ?? [])
    for (const content of output.content ?? [])
      if (content.type === "output_text" && content.text) return content.text;
  throw new Error("OpenAI response did not contain structured output.");
}

function createOpenAiProvider(
  options: ProviderOptions & { openAiApiKey: string },
): EnrichmentProvider {
  return {
    config: options.config,
    async analyzeArtwork({ imageBytes, metadata }) {
      const payload = await boundedOpenAiRequest(
        "responses",
        {
          model: options.config.visionModel,
          store: false,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Analyze only visible qualities useful for finding aesthetically similar artwork. Do not guess identity or provenance. Trusted catalog metadata: ${JSON.stringify(metadata)}`,
                },
                {
                  type: "input_image",
                  image_url: `data:image/jpeg;base64,${bytesToBase64(imageBytes)}`,
                  detail: "low",
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "artwork_visual_facets",
              strict: true,
              schema: visualFacetJsonSchema,
            },
          },
        },
        options,
      );
      return parseFacets(extractOpenAiResponse(payload), "OpenAI");
    },
    async embedText(text) {
      const payload = (await boundedOpenAiRequest(
        "embeddings",
        {
          model: options.config.embeddingModel,
          input: text,
          dimensions: options.config.embeddingDimensions,
          encoding_format: "float",
        },
        options,
      )) as { data?: Array<{ embedding?: number[] }> };
      return validateEmbedding(payload.data?.[0]?.embedding, options.config);
    },
  };
}

function createCloudflareProvider(
  options: ProviderOptions & { workersAi: WorkersAiBinding },
): EnrichmentProvider {
  return {
    config: options.config,
    async analyzeArtwork({ imageBytes, metadata }) {
      const payload = await options.workersAi.run(options.config.visionModel, {
        messages: [
          {
            role: "system",
            content:
              "Return only the requested JSON. Analyze visible aesthetic qualities and never infer identity or provenance.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Find visual qualities useful for aesthetically similar artwork. Trusted catalog metadata: ${JSON.stringify(metadata)}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${bytesToBase64(imageBytes)}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "artwork_visual_facets",
            strict: true,
            schema: visualFacetJsonSchema,
          },
        },
        store: false,
        temperature: 0,
        max_completion_tokens: 1_200,
      });
      return parseFacets(extractCloudflareResponse(payload), "Cloudflare");
    },
    async embedText(text) {
      const payload = (await options.workersAi.run(options.config.embeddingModel, {
        text: [text],
        pooling: "cls",
      })) as { data?: number[][] };
      return validateEmbedding(payload.data?.[0], options.config);
    },
  };
}

export function createEnrichmentProvider(options: ProviderOptions): EnrichmentProvider {
  if (options.config.provider === "cloudflare") {
    if (!options.workersAi) throw new Error("Cloudflare Workers AI binding is unavailable.");
    return createCloudflareProvider({ ...options, workersAi: options.workersAi });
  }
  if (!options.openAiApiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI provider.");
  return createOpenAiProvider({ ...options, openAiApiKey: options.openAiApiKey });
}
