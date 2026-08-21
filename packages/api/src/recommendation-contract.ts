import { z } from "zod";

import {
  artistSummarySchema,
  artworkCardSchema,
  gallerySummarySchema,
  styleSummarySchema,
} from "./art-contract";

const entityId = z.string().trim().min(1).max(96);
const slug = entityId.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const discoverySchema = z.enum(["familiar", "balanced", "adventurous"]);
export const recommendationReasonCodeSchema = z.enum([
  "followed_artist",
  "followed_gallery",
  "followed_style",
  "similar_to_favorite",
  "style_affinity",
  "new_work",
  "discovery",
]);

export const recommendationInputSchema = z.object({
  seedArtworkId: entityId.optional(),
  personalized: z.boolean().default(false),
  discovery: discoverySchema.default("balanced"),
  category: slug.optional(),
  gallery: slug.optional(),
  style: slug.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(48).default(24),
});

export const recommendationItemSchema = z.object({
  artwork: artworkCardSchema,
  reason: z.object({ code: recommendationReasonCodeSchema, label: z.string() }),
  recommendationToken: z.string(),
});

export const recommendationPageSchema = z.object({
  items: z.array(recommendationItemSchema),
  nextCursor: z.string().nullable(),
  personalized: z.boolean(),
});

export const followingListSchema = z.object({
  artists: z.array(artistSummarySchema),
  galleries: z.array(gallerySummarySchema),
  styles: z.array(styleSummarySchema),
});

export const followToggleInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("artist"), id: entityId }),
  z.object({ kind: z.literal("gallery"), id: entityId }),
  z.object({ kind: z.literal("style"), id: entityId }),
]);

export const hiddenArtworkInputSchema = z.object({ artworkId: entityId, hidden: z.boolean() });

export type RecommendationReasonCode = z.infer<typeof recommendationReasonCodeSchema>;
