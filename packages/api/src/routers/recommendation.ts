import {
  artist,
  artwork,
  artworkArtist,
  artworkCategory,
  artworkEnrichment,
  artworkStyle,
  catalogState,
  category,
  favorite,
  followedArtist,
  followedGallery,
  followedStyle,
  gallery,
  hiddenArtwork,
  style,
  tasteProfile,
} from "@art/db/schema/art";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from "@art/db/query";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { artworkPageSchema, favoritesListInputSchema } from "../art-contract";
import {
  effectivePersonalization,
  diversifyStable,
  freshnessScore,
  recommendationAnchorIds,
  recommendationSignalUserId,
  recommendationSignature,
  recommendationScore,
  recommendationVectorState,
  selectRecommendationReason,
  stableRecommendationHash,
} from "../recommendation-core";
import {
  followToggleInputSchema,
  followingListSchema,
  hiddenArtworkInputSchema,
  recommendationInputSchema,
  recommendationPageSchema,
  type RecommendationReasonCode,
} from "../recommendation-contract";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure } from "../index";
import { artworkSelection, hydrateCards, type ArtworkRow } from "./art";

type Database = Context["db"];
type Facets = {
  artists: Set<string>;
  categories: Set<string>;
  styles: Set<string>;
  galleries: Set<string>;
  gallery: string;
};
type Ranked = {
  row: ArtworkRow;
  score: number;
  reason: { code: RecommendationReasonCode; label: string };
};

const RANKER_VERSION = "d1-hybrid-v1";
const MINIMUM_FAVORITES = 5;
const followingCursorSchema = z.object({ at: z.number().int(), id: z.string() });
const recommendationCursorSchema = z.object({
  offset: z.number().int().nonnegative(),
  signature: z.string(),
  vectorMode: z.enum(["d1", "vector"]),
  vectorDigest: z.string(),
});

function encodeCursor(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(cursor: string): unknown {
  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: "This page cursor is invalid. Refresh and try again.",
    });
  }
}

function overlap(left: Set<string>, right: Set<string>) {
  let total = 0;
  for (const value of left) if (right.has(value)) total += 1;
  return total;
}

async function loadFacets(db: Database, rows: ArtworkRow[]): Promise<Map<string, Facets>> {
  const ids = rows.map((row) => row.id);
  const result = new Map(
    rows.map((row) => [
      row.id,
      {
        artists: new Set<string>(),
        categories: new Set<string>(),
        styles: new Set<string>(),
        galleries: new Set([row.gallerySlug]),
        gallery: row.gallerySlug,
      },
    ]),
  );
  if (!ids.length) return result;
  const [artists, categories, styles] = await Promise.all([
    db
      .select({ artworkId: artworkArtist.artworkId, id: artworkArtist.artistId })
      .from(artworkArtist)
      .where(inArray(artworkArtist.artworkId, ids)),
    db
      .select({ artworkId: artworkCategory.artworkId, id: artworkCategory.categoryId })
      .from(artworkCategory)
      .where(inArray(artworkCategory.artworkId, ids)),
    db
      .select({ artworkId: artworkStyle.artworkId, id: artworkStyle.styleId })
      .from(artworkStyle)
      .where(inArray(artworkStyle.artworkId, ids)),
  ]);
  for (const item of artists) result.get(item.artworkId)?.artists.add(item.id);
  for (const item of categories) result.get(item.artworkId)?.categories.add(item.id);
  for (const item of styles) result.get(item.artworkId)?.styles.add(item.id);
  return result;
}

function combineFacets(ids: string[], facets: Map<string, Facets>): Facets {
  const combined: Facets = {
    artists: new Set(),
    categories: new Set(),
    styles: new Set(),
    galleries: new Set(),
    gallery: "",
  };
  for (const id of ids) {
    const item = facets.get(id);
    if (!item) continue;
    for (const value of item.artists) combined.artists.add(value);
    for (const value of item.categories) combined.categories.add(value);
    for (const value of item.styles) combined.styles.add(value);
    for (const value of item.galleries) combined.galleries.add(value);
  }
  return combined;
}

function affinity(candidate: Facets, positive: Facets, negative: Facets) {
  const positiveScore =
    overlap(candidate.artists, positive.artists) * 5 +
    overlap(candidate.styles, positive.styles) * 3 +
    overlap(candidate.categories, positive.categories) * 1.25 +
    overlap(candidate.galleries, positive.galleries) * 2;
  const negativeScore =
    overlap(candidate.artists, negative.artists) * 4 +
    overlap(candidate.styles, negative.styles) * 2 +
    overlap(candidate.categories, negative.categories) * 0.75 +
    overlap(candidate.galleries, negative.galleries);
  return positiveScore - negativeScore;
}

function average(vectors: number[][]) {
  if (!vectors.length) return undefined;
  const dimensions = vectors[0]?.length ?? 0;
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions)) return undefined;
  const result = Array.from({ length: dimensions }, () => 0);
  for (const vector of vectors) for (let i = 0; i < dimensions; i += 1) result[i]! += vector[i]!;
  return result.map((value) => value / vectors.length);
}

async function refreshTasteProfile(
  db: Database,
  userId: string,
  favoriteIds: string[],
  revision: number,
  embedding: number[],
) {
  await db
    .insert(tasteProfile)
    .values({
      userId,
      revision,
      embedding: JSON.stringify(embedding),
      embeddingDimensions: embedding.length,
      artworkCount: favoriteIds.length,
    })
    .onConflictDoUpdate({
      target: tasteProfile.userId,
      set: {
        revision,
        embedding: JSON.stringify(embedding),
        embeddingDimensions: embedding.length,
        artworkCount: favoriteIds.length,
        updatedAt: new Date(),
      },
    });
}

function reasonFor(
  candidate: Facets,
  positive: Facets,
  personalized: boolean,
  seed: boolean,
  followed: Facets,
  followedGalleries: Set<string>,
  hasAffinity: boolean,
  isNew: boolean,
): Ranked["reason"] {
  const followedKind = overlap(candidate.artists, followed.artists)
    ? "artist"
    : followedGalleries.has(candidate.gallery)
      ? "gallery"
      : overlap(candidate.styles, followed.styles)
        ? "style"
        : undefined;
  return selectRecommendationReason({
    followed: followedKind,
    personalized,
    seed,
    sharedStyle: Boolean(overlap(candidate.styles, positive.styles)),
    hasAffinity,
    isNew,
  });
}

function diversify(
  items: Ranked[],
  level: "familiar" | "balanced" | "adventurous",
  facets: Map<string, Facets>,
) {
  const penalty = level === "familiar" ? 0.35 : level === "balanced" ? 1 : 2;
  return diversifyStable(
    items,
    penalty,
    (item) => item.score,
    (item) => facets.get(item.row.id)!.artists,
    (item) => facets.get(item.row.id)!.gallery,
  );
}

export const recommendationsRouter = {
  list: publicProcedure
    .input(recommendationInputSchema)
    .output(recommendationPageSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session?.user.id;
      const personalized = effectivePersonalization(input.personalized, userId);
      const signalUserId = recommendationSignalUserId(input.personalized, userId);
      const [
        favoriteRows,
        hiddenRows,
        profileRows,
        followedArtistRows,
        followedGalleryRows,
        followedStyleRows,
      ] = signalUserId
        ? await Promise.all([
            context.db
              .select({ id: favorite.artworkId })
              .from(favorite)
              .where(eq(favorite.userId, signalUserId))
              .orderBy(desc(favorite.createdAt))
              .limit(50),
            context.db
              .select({ id: hiddenArtwork.artworkId })
              .from(hiddenArtwork)
              .where(eq(hiddenArtwork.userId, signalUserId)),
            context.db
              .select()
              .from(tasteProfile)
              .where(eq(tasteProfile.userId, signalUserId))
              .limit(1),
            context.db
              .select({ id: followedArtist.artistId })
              .from(followedArtist)
              .where(eq(followedArtist.userId, signalUserId)),
            context.db
              .select({ slug: gallery.slug })
              .from(followedGallery)
              .innerJoin(gallery, eq(gallery.id, followedGallery.galleryId))
              .where(eq(followedGallery.userId, signalUserId)),
            context.db
              .select({ id: followedStyle.styleId })
              .from(followedStyle)
              .where(eq(followedStyle.userId, signalUserId)),
          ])
        : [[], [], [], [], [], []];
      const favoriteIds = favoriteRows.map((row) => row.id);
      const hiddenIds = hiddenRows.map((row) => row.id);
      const profile = profileRows[0];
      const revision = profile?.revision ?? 0;
      const [catalogSnapshot] = await context.db
        .select({
          version: catalogState.version,
          total: sql<number>`(select count(*) from ${artwork})`,
          latestUpdate: sql<number>`(select coalesce(max(updated_at), 0) from ${artwork})`,
        })
        .from(catalogState)
        .where(eq(catalogState.id, 1))
        .limit(1);
      const [enrichmentSnapshot] = await context.db
        .select({
          ready: sql<number>`sum(case when ${artworkEnrichment.status} = 'ready' then 1 else 0 end)`,
          latestProcessed: sql<number>`coalesce(max(${artworkEnrichment.processedAt}), 0)`,
          latestUpdate: sql<number>`coalesce(max(${artworkEnrichment.updatedAt}), 0)`,
        })
        .from(artworkEnrichment);
      const day = new Date().toISOString().slice(0, 10);
      const rankingNow = Date.parse(`${day}T00:00:00.000Z`);
      const signature = recommendationSignature({
        ...input,
        cursor: undefined,
        limit: undefined,
        personalized,
        revision,
        follows: personalized
          ? {
              artists: followedArtistRows.map((row) => row.id).sort(),
              galleries: followedGalleryRows.map((row) => row.slug).sort(),
              styles: followedStyleRows.map((row) => row.id).sort(),
            }
          : undefined,
        catalogSnapshot,
        enrichmentSnapshot,
        day,
        ranker: RANKER_VERSION,
      });
      let offset = 0;
      let cursorState: z.infer<typeof recommendationCursorSchema> | undefined;
      if (input.cursor) {
        const parsed = recommendationCursorSchema.safeParse(decodeCursor(input.cursor));
        if (!parsed.success || parsed.data.signature !== signature)
          throw new ORPCError("BAD_REQUEST", {
            message: "This recommendation cursor has expired. Refresh and try again.",
          });
        cursorState = parsed.data;
        offset = cursorState.offset;
      }

      const conditions: SQL[] = [];
      if (input.seedArtworkId) conditions.push(sql`${artwork.id} <> ${input.seedArtworkId}`);
      if (hiddenIds.length) conditions.push(notInArray(artwork.id, hiddenIds));
      if (personalized && !input.seedArtworkId && favoriteIds.length)
        conditions.push(notInArray(artwork.id, favoriteIds));
      if (input.gallery) conditions.push(eq(gallery.slug, input.gallery));
      if (input.category)
        conditions.push(
          exists(
            context.db
              .select({ id: artworkCategory.artworkId })
              .from(artworkCategory)
              .innerJoin(category, eq(category.id, artworkCategory.categoryId))
              .where(
                and(eq(artworkCategory.artworkId, artwork.id), eq(category.slug, input.category)),
              ),
          ),
        );
      if (input.style)
        conditions.push(
          exists(
            context.db
              .select({ id: artworkStyle.artworkId })
              .from(artworkStyle)
              .innerJoin(style, eq(style.id, artworkStyle.styleId))
              .where(and(eq(artworkStyle.artworkId, artwork.id), eq(style.slug, input.style))),
          ),
        );
      let candidates = await context.db
        .select(artworkSelection)
        .from(artwork)
        .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
        .where(and(...conditions))
        .orderBy(desc(artwork.curatedAt), desc(artwork.id))
        .limit(500);

      if (input.seedArtworkId && !candidates.some((row) => row.id === input.seedArtworkId)) {
        const [seedExists] = await context.db
          .select({ id: artwork.id })
          .from(artwork)
          .where(eq(artwork.id, input.seedArtworkId))
          .limit(1);
        if (!seedExists) throw new ORPCError("NOT_FOUND", { message: "Seed artwork not found." });
      }
      const anchorIds = recommendationAnchorIds(input.seedArtworkId, personalized, favoriteIds);

      let anchorVector: number[] | undefined;
      const vectorScores = new Map<string, number>();
      const negativeVectorScores = new Map<string, number>();
      if (context.recommendationIndex) {
        try {
          if (anchorIds.length) {
            if (!input.seedArtworkId && profile?.embedding) {
              try {
                anchorVector = z.array(z.number()).parse(JSON.parse(profile.embedding));
              } catch {
                anchorVector = undefined;
              }
            }
            if (!anchorVector) {
              const vectors = await context.recommendationIndex.getByIds(anchorIds);
              anchorVector = average(vectors.map((item) => item.values));
              if (anchorVector && userId && !input.seedArtworkId)
                await refreshTasteProfile(context.db, userId, favoriteIds, revision, anchorVector);
            }
            if (anchorVector) {
              const result = await context.recommendationIndex.query(anchorVector, {
                topK: Math.min(100, Math.max(20, candidates.length)),
                returnMetadata: "none",
              });
              for (const match of result.matches) vectorScores.set(match.id, match.score);
            }
          }
          if (personalized && hiddenIds.length) {
            const hiddenVectors = await context.recommendationIndex.getByIds(hiddenIds);
            const negativeVector = average(hiddenVectors.map((item) => item.values));
            if (negativeVector) {
              const result = await context.recommendationIndex.query(negativeVector, {
                topK: Math.min(100, Math.max(20, candidates.length)),
                returnMetadata: "none",
              });
              for (const match of result.matches) negativeVectorScores.set(match.id, match.score);
            }
          }
        } catch {
          // Vectorize is an optional accelerator. Deterministic D1 ranking remains available.
          vectorScores.clear();
          negativeVectorScores.clear();
        }
      }
      const vectorState = recommendationVectorState(vectorScores, negativeVectorScores);
      if (
        cursorState &&
        (cursorState.vectorMode !== vectorState.mode ||
          cursorState.vectorDigest !== vectorState.digest)
      )
        throw new ORPCError("BAD_REQUEST", {
          message: "These recommendations changed while you were browsing. Refresh and try again.",
        });

      const retrievedIds = [...vectorScores.keys()];
      const candidateIds = new Set(candidates.map((row) => row.id));
      const missingRetrievedIds = retrievedIds.filter((id) => !candidateIds.has(id));
      if (missingRetrievedIds.length) {
        const retrievedRows = await context.db
          .select(artworkSelection)
          .from(artwork)
          .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
          .where(and(...conditions, inArray(artwork.id, missingRetrievedIds)));
        candidates = [...candidates, ...retrievedRows];
      }

      const allFacetIds = [
        ...new Set([...candidates.map((row) => row.id), ...anchorIds, ...hiddenIds]),
      ];
      const facetRows = allFacetIds.length
        ? await context.db
            .select(artworkSelection)
            .from(artwork)
            .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
            .where(inArray(artwork.id, allFacetIds))
        : [];
      const facets = await loadFacets(context.db, facetRows);
      const positive = combineFacets(anchorIds, facets);
      const negative = personalized ? combineFacets(hiddenIds, facets) : combineFacets([], facets);
      const followed: Facets = {
        artists: new Set(personalized ? followedArtistRows.map((row) => row.id) : []),
        categories: new Set(),
        styles: new Set(personalized ? followedStyleRows.map((row) => row.id) : []),
        galleries: new Set(),
        gallery: "",
      };
      const followedGalleries = new Set(
        personalized ? followedGalleryRows.map((row) => row.slug) : [],
      );

      const affinityWeight =
        input.discovery === "familiar" ? 1.4 : input.discovery === "balanced" ? 1 : 0.45;
      const randomWeight =
        input.discovery === "familiar" ? 0.15 : input.discovery === "balanced" ? 0.7 : 1.8;
      const freshnessWeight =
        input.discovery === "familiar" ? 0.2 : input.discovery === "balanced" ? 0.75 : 1.5;
      const ranked = candidates.map((row) => {
        const candidateFacets = facets.get(row.id)!;
        const semantic = vectorScores.get(row.id);
        const stableRandom = stableRecommendationHash(`${signature}:${row.id}`) / 0xffffffff;
        const followBoost =
          overlap(candidateFacets.artists, followed.artists) * 3 +
          overlap(candidateFacets.styles, followed.styles) * 1.5 +
          (followedGalleries.has(candidateFacets.gallery) ? 2 : 0);
        const facetAffinity = affinity(candidateFacets, positive, negative);
        const freshness = freshnessScore(row.curatedAt, rankingNow);
        const score = recommendationScore({
          semantic: semantic ?? 0,
          negativeSemantic: negativeVectorScores.get(row.id) ?? 0,
          facetAffinity,
          affinityWeight,
          followBoost,
          freshness,
          freshnessWeight,
          stableRandom,
          randomWeight,
        });
        const isNew = row.curatedAt.getTime() >= rankingNow - 30 * 86_400_000;
        return {
          row,
          score,
          reason: reasonFor(
            candidateFacets,
            positive,
            personalized,
            Boolean(input.seedArtworkId),
            followed,
            followedGalleries,
            (semantic ?? 0) > 0.4 || facetAffinity > 0,
            isNew,
          ),
        };
      });
      const ordered = diversify(
        ranked.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id)),
        input.discovery,
        facets,
      );
      const page = ordered.slice(offset, offset + input.limit);
      const cards = await hydrateCards(
        context.db,
        page.map((item) => item.row),
        userId,
      );
      return {
        items: page.map((item, index) => ({
          artwork: cards[index]!,
          reason: item.reason,
          recommendationToken: `${RANKER_VERSION}.${signature}.${stableRecommendationHash(item.row.id).toString(36)}`,
        })),
        nextCursor:
          offset + input.limit < ordered.length
            ? encodeCursor({
                offset: offset + input.limit,
                signature,
                vectorMode: vectorState.mode,
                vectorDigest: vectorState.digest,
              })
            : null,
        personalized,
      };
    }),

  setHidden: protectedProcedure
    .input(hiddenArtworkInputSchema)
    .output(hiddenArtworkInputSchema.extend({ hidden: z.boolean() }))
    .handler(async ({ context, input }) => {
      const [existsRow] = await context.db
        .select({ id: artwork.id })
        .from(artwork)
        .where(eq(artwork.id, input.artworkId))
        .limit(1);
      if (!existsRow) throw new ORPCError("NOT_FOUND", { message: "Artwork not found." });
      const key = and(
        eq(hiddenArtwork.userId, context.session.user.id),
        eq(hiddenArtwork.artworkId, input.artworkId),
      );
      const updateHidden = input.hidden
        ? context.db
            .insert(hiddenArtwork)
            .values({ userId: context.session.user.id, artworkId: input.artworkId })
            .onConflictDoNothing()
        : context.db.delete(hiddenArtwork).where(key);
      const updateProfile = context.db
        .insert(tasteProfile)
        .values({ userId: context.session.user.id, revision: 1 })
        .onConflictDoUpdate({
          target: tasteProfile.userId,
          set: {
            revision: sql`${tasteProfile.revision} + 1`,
            embedding: null,
            updatedAt: new Date(),
          },
        });
      await context.db.batch([updateHidden, updateProfile]);
      return input;
    }),

  profile: protectedProcedure
    .output(
      z.object({
        favoriteCount: z.number().int(),
        minimumFavoriteCount: z.literal(MINIMUM_FAVORITES),
        needsOnboarding: z.boolean(),
        revision: z.number().int(),
      }),
    )
    .handler(async ({ context }) => {
      const [[favoriteCount], [profile]] = await Promise.all([
        context.db
          .select({ value: count() })
          .from(favorite)
          .where(eq(favorite.userId, context.session.user.id)),
        context.db
          .select({ revision: tasteProfile.revision })
          .from(tasteProfile)
          .where(eq(tasteProfile.userId, context.session.user.id))
          .limit(1),
      ]);
      const value = favoriteCount?.value ?? 0;
      return {
        favoriteCount: value,
        minimumFavoriteCount: MINIMUM_FAVORITES,
        needsOnboarding: value < MINIMUM_FAVORITES,
        revision: profile?.revision ?? 0,
      };
    }),

  track: publicProcedure
    .input(
      z.object({
        events: z
          .array(
            z.object({
              recommendationToken: z.string().min(1).max(160),
              type: z.enum(["impression", "open"]),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .output(z.object({ accepted: z.number().int() }))
    .handler(({ context, input }) => {
      for (const event of input.events)
        context.recommendationAnalytics?.writeDataPoint({
          blobs: [event.type, event.recommendationToken, RANKER_VERSION],
          doubles: [Date.now()],
        });
      return { accepted: input.events.length };
    }),
};

export const followingRouter = {
  feed: protectedProcedure
    .input(favoritesListInputSchema)
    .output(artworkPageSchema)
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const conditions: SQL[] = [
        or(
          exists(
            context.db
              .select({ id: followedGallery.galleryId })
              .from(followedGallery)
              .where(
                and(
                  eq(followedGallery.userId, userId),
                  eq(followedGallery.galleryId, artwork.galleryId),
                ),
              ),
          ),
          exists(
            context.db
              .select({ id: followedArtist.artistId })
              .from(followedArtist)
              .innerJoin(artworkArtist, eq(artworkArtist.artistId, followedArtist.artistId))
              .where(
                and(eq(followedArtist.userId, userId), eq(artworkArtist.artworkId, artwork.id)),
              ),
          ),
          exists(
            context.db
              .select({ id: followedStyle.styleId })
              .from(followedStyle)
              .innerJoin(artworkStyle, eq(artworkStyle.styleId, followedStyle.styleId))
              .where(and(eq(followedStyle.userId, userId), eq(artworkStyle.artworkId, artwork.id))),
          ),
        )!,
        sql`not exists (select 1 from ${hiddenArtwork} where ${hiddenArtwork.userId} = ${userId} and ${hiddenArtwork.artworkId} = ${artwork.id})`,
      ];
      if (input.cursor) {
        const parsed = followingCursorSchema.safeParse(decodeCursor(input.cursor));
        if (!parsed.success)
          throw new ORPCError("BAD_REQUEST", { message: "This page cursor is invalid." });
        const at = new Date(parsed.data.at);
        conditions.push(
          or(
            lt(artwork.curatedAt, at),
            and(eq(artwork.curatedAt, at), lt(artwork.id, parsed.data.id)),
          )!,
        );
      }
      const rows = await context.db
        .select(artworkSelection)
        .from(artwork)
        .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
        .where(and(...conditions))
        .orderBy(desc(artwork.curatedAt), desc(artwork.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: await hydrateCards(context.db, page, userId),
        nextCursor:
          rows.length > input.limit && last
            ? encodeCursor({ at: last.curatedAt.getTime(), id: last.id })
            : null,
      };
    }),

  list: protectedProcedure.output(followingListSchema).handler(async ({ context }) => {
    const userId = context.session.user.id;
    const [artistRows, galleryRows, styleRows] = await Promise.all([
      context.db
        .select({
          id: artist.id,
          slug: artist.slug,
          name: artist.name,
          description: artist.description,
          artworkCount: count(artworkArtist.artworkId),
        })
        .from(followedArtist)
        .innerJoin(artist, eq(artist.id, followedArtist.artistId))
        .leftJoin(artworkArtist, eq(artist.id, artworkArtist.artistId))
        .where(eq(followedArtist.userId, userId))
        .groupBy(artist.id)
        .orderBy(asc(artist.name)),
      context.db
        .select({
          id: gallery.id,
          slug: gallery.slug,
          name: gallery.name,
          location: gallery.location,
          url: gallery.url,
          description: gallery.description,
          artworkCount: count(artwork.id),
        })
        .from(followedGallery)
        .innerJoin(gallery, eq(gallery.id, followedGallery.galleryId))
        .leftJoin(artwork, eq(artwork.galleryId, gallery.id))
        .where(eq(followedGallery.userId, userId))
        .groupBy(gallery.id)
        .orderBy(asc(gallery.name)),
      context.db
        .select({
          id: style.id,
          slug: style.slug,
          name: style.name,
          description: style.description,
          artworkCount: count(artworkStyle.artworkId),
        })
        .from(followedStyle)
        .innerJoin(style, eq(style.id, followedStyle.styleId))
        .leftJoin(artworkStyle, eq(style.id, artworkStyle.styleId))
        .where(eq(followedStyle.userId, userId))
        .groupBy(style.id)
        .orderBy(asc(style.name)),
    ]);
    return {
      artists: artistRows.map((row) => ({ ...row, coverImageUrl: null, isFollowing: true })),
      galleries: galleryRows.map((row) => ({ ...row, coverImageUrl: null, isFollowing: true })),
      styles: styleRows.map((row) => ({ ...row, coverImageUrl: null, isFollowing: true })),
    };
  }),

  toggle: protectedProcedure
    .input(followToggleInputSchema)
    .output(
      z.object({
        kind: z.enum(["artist", "gallery", "style"]),
        id: z.string(),
        isFollowing: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      if (input.kind === "artist") {
        const [target] = await context.db
          .select({ id: artist.id })
          .from(artist)
          .where(eq(artist.id, input.id))
          .limit(1);
        if (!target) throw new ORPCError("NOT_FOUND", { message: "Artist not found." });
        const key = and(eq(followedArtist.userId, userId), eq(followedArtist.artistId, input.id));
        const [existing] = await context.db
          .select({ id: followedArtist.artistId })
          .from(followedArtist)
          .where(key)
          .limit(1);
        if (existing) {
          await context.db.delete(followedArtist).where(key);
          return { ...input, isFollowing: false };
        }
        await context.db.insert(followedArtist).values({ userId, artistId: input.id });
        return { ...input, isFollowing: true };
      }
      if (input.kind === "gallery") {
        const [target] = await context.db
          .select({ id: gallery.id })
          .from(gallery)
          .where(eq(gallery.id, input.id))
          .limit(1);
        if (!target) throw new ORPCError("NOT_FOUND", { message: "Gallery not found." });
        const key = and(
          eq(followedGallery.userId, userId),
          eq(followedGallery.galleryId, input.id),
        );
        const [existing] = await context.db
          .select({ id: followedGallery.galleryId })
          .from(followedGallery)
          .where(key)
          .limit(1);
        if (existing) {
          await context.db.delete(followedGallery).where(key);
          return { ...input, isFollowing: false };
        }
        await context.db.insert(followedGallery).values({ userId, galleryId: input.id });
        return { ...input, isFollowing: true };
      }
      const [target] = await context.db
        .select({ id: style.id })
        .from(style)
        .where(eq(style.id, input.id))
        .limit(1);
      if (!target) throw new ORPCError("NOT_FOUND", { message: "Style not found." });
      const key = and(eq(followedStyle.userId, userId), eq(followedStyle.styleId, input.id));
      const [existing] = await context.db
        .select({ id: followedStyle.styleId })
        .from(followedStyle)
        .where(key)
        .limit(1);
      if (existing) {
        await context.db.delete(followedStyle).where(key);
        return { ...input, isFollowing: false };
      }
      await context.db.insert(followedStyle).values({ userId, styleId: input.id });
      return { ...input, isFollowing: true };
    }),
};
