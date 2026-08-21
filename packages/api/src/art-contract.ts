import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug.");

export const taxonomyLinkSchema = z.object({
  slug,
  name: z.string(),
});

export const artworkCardSchema = z.object({
  id: z.string(),
  slug,
  title: z.string(),
  artist: z.string(),
  artistSlug: slug,
  date: z.string(),
  imageUrl: z.url(),
  thumbnailUrl: z.url(),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  alt: z.string(),
  gallery: z.string(),
  gallerySlug: slug,
  category: z.string(),
  styles: z.array(taxonomyLinkSchema),
  isFavorite: z.boolean(),
});

export const artworkPageSchema = z.object({
  items: z.array(artworkCardSchema),
  nextCursor: z.string().nullable(),
});

export const artworkListInputSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(48).default(24),
  category: slug.optional(),
  gallery: slug.optional(),
  style: slug.optional(),
  artist: slug.optional(),
  sort: z.enum(["recent", "title", "artist"]).default("recent"),
});

export const artistSummarySchema = z.object({
  id: z.string(),
  slug,
  name: z.string(),
  description: z.string(),
  artworkCount: z.number().int().nonnegative(),
  coverImageUrl: z.url().nullable(),
  isFollowing: z.boolean(),
});

export const artworkDetailSchema = artworkCardSchema.extend({
  description: z.string(),
  medium: z.string(),
  dimensions: z.string(),
  creditLine: z.string(),
  galleryUrl: z.url(),
  categories: z.array(taxonomyLinkSchema),
  source: z.object({
    name: z.string(),
    url: z.url(),
    attribution: z.string(),
  }),
  imageSource: z.object({
    url: z.url(),
    attribution: z.string(),
  }),
});

export const gallerySummarySchema = z.object({
  id: z.string(),
  slug,
  name: z.string(),
  location: z.string(),
  url: z.url(),
  description: z.string(),
  artworkCount: z.number().int().nonnegative(),
  coverImageUrl: z.url().nullable(),
  isFollowing: z.boolean(),
});

export const styleSummarySchema = z.object({
  id: z.string(),
  slug,
  name: z.string(),
  description: z.string(),
  artworkCount: z.number().int().nonnegative(),
  coverImageUrl: z.url().nullable(),
  isFollowing: z.boolean(),
});

export const browseSlugInputSchema = z.object({ slug });

export const favoritesListInputSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(48).default(24),
});

export const favoriteToggleInputSchema = z.object({
  artworkId: z
    .string()
    .trim()
    .min(1)
    .max(96)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export type ArtworkCard = z.infer<typeof artworkCardSchema>;
export type ArtworkListInput = z.infer<typeof artworkListInputSchema>;
