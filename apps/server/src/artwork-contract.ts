import { canonicalArtifactSourceUrl } from "@art/db/artifacts";
import { z } from "zod";

import type { EnrichmentModelConfig } from "./enrichment-provider";

export type ArtworkDatabase = Pick<D1Database, "batch" | "prepare">;
export type ArtworkBucket = Pick<R2Bucket, "put">;
export type ArtworkWriteDependencies = {
  bucket: ArtworkBucket;
  database: ArtworkDatabase;
  fetcher?: typeof fetch;
  now?: () => number;
  secret: string;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Tests may shorten the production 12-second per-attempt deadline. */
  downloadAttemptTimeoutMs?: number;
  enrichmentQueue?: Pick<
    Queue<{
      artworkId: string;
      reason: "import" | "update" | "backfill";
      requestedAt: number;
    }>,
    "send"
  >;
  enrichmentConfig: EnrichmentModelConfig;
};

export class ArtworkRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const id = text(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const short = text(240);
const long = text(4_000);
const url = z
  .string()
  .trim()
  .max(2_048)
  .transform((value, context) => {
    try {
      return canonicalArtifactSourceUrl(value);
    } catch {
      context.addIssue({ code: "custom", message: "Use a public HTTPS URL." });
      return z.NEVER;
    }
  });
const create = <T extends z.core.$ZodShape>(shape: T) =>
  z.object({ create: z.object(shape).strict() }).strict();
const source = z.union([
  id,
  create({
    name: short,
    kind: z.enum(["museum", "gallery", "curation", "social"]),
    url,
    attribution: text(1_000),
    termsUrl: url.optional(),
  }),
]);
const gallery = z.union([id, create({ name: short, location: short, description: long, url })]);

export const artworkDraftSchema = z
  .object({
    artworkId: id.optional(),
    inboxId: z.uuid().optional(),
    source,
    gallery,
    sourceExternalId: short,
    title: short,
    artist: short,
    dateDisplay: text(120),
    description: long,
    medium: text(500),
    dimensions: text(500),
    creditLine: text(1_000),
    sourceUrl: url,
    imageUrl: url,
    thumbnailUrl: url,
    imageSourceUrl: url,
    imageAttribution: text(1_000),
    alt: text(1_000),
    isPublicDomain: z.boolean(),
    categorySlugs: z.array(id).min(1).max(4),
    styleSlugs: z.array(id).min(1).max(8),
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.imageUrl === draft.thumbnailUrl)
      context.addIssue({ code: "custom", path: ["thumbnailUrl"], message: "Use a thumbnail." });
    for (const field of ["categorySlugs", "styleSlugs"] as const) {
      if (new Set(draft[field]).size !== draft[field].length)
        context.addIssue({ code: "custom", path: [field], message: "Duplicate taxonomy." });
    }
  });

export type ArtworkDraft = z.infer<typeof artworkDraftSchema>;
