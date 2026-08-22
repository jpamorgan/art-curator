import {
  artist,
  artwork,
  artworkArtist,
  artworkCategory,
  artworkStyle,
  category,
  favorite,
  followedArtist,
  followedGallery,
  followedStyle,
  gallery,
  source,
  style,
  tasteProfile,
} from "@art/db/schema/art";
import { artworkArtifactUrl } from "@art/db/artifacts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "@art/db/query";
import { env } from "@art/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  artworkCardSchema,
  artworkDetailSchema,
  artworkListInputSchema,
  artworkPageSchema,
  artistSummarySchema,
  browseSlugInputSchema,
  favoriteToggleInputSchema,
  favoritesListInputSchema,
  gallerySummarySchema,
  styleSummarySchema,
  taxonomyLinkSchema,
  type ArtworkCard,
  type ArtworkListInput,
} from "../art-contract";
import type { Context } from "../context";
import { protectedProcedure, publicProcedure } from "../index";

type Database = Context["db"];

export type ArtworkRow = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  artistSlug: string;
  date: string;
  imageFingerprint: string;
  thumbnailFingerprint: string;
  imageWidth: number;
  imageHeight: number;
  alt: string;
  gallery: string;
  gallerySlug: string;
  curatedAt: Date;
};

export const artworkSelection = {
  id: artwork.id,
  slug: artwork.slug,
  title: artwork.title,
  artist: artwork.artist,
  artistSlug: sql<string>`(
    select ${artist.slug}
    from ${artworkArtist}
    inner join ${artist} on ${artist.id} = ${artworkArtist.artistId}
    where ${artworkArtist.artworkId} = ${artwork.id}
    order by ${artworkArtist.position}, ${artist.id}
    limit 1
  )`,
  date: artwork.dateDisplay,
  imageFingerprint: artwork.imageFingerprint,
  thumbnailFingerprint: artwork.thumbnailFingerprint,
  imageWidth: artwork.imageWidth,
  imageHeight: artwork.imageHeight,
  alt: artwork.alt,
  gallery: gallery.name,
  gallerySlug: gallery.slug,
  curatedAt: artwork.curatedAt,
};

const feedCursorSchema = z.discriminatedUnion("sort", [
  z.object({ sort: z.literal("recent"), value: z.number().int(), id: z.string() }),
  z.object({ sort: z.literal("title"), value: z.string(), id: z.string() }),
  z.object({ sort: z.literal("artist"), value: z.string(), id: z.string() }),
]);

const favoriteCursorSchema = z.object({
  sort: z.literal("favorite"),
  value: z.number().int(),
  id: z.string(),
});

type FeedCursor = z.infer<typeof feedCursorSchema>;
type FavoriteCursor = z.infer<typeof favoriteCursorSchema>;

function invalidCursor(): never {
  throw new ORPCError("BAD_REQUEST", {
    message: "This page cursor is invalid. Refresh and try again.",
  });
}

function encodeCursor(value: FeedCursor | FavoriteCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeJsonCursor(cursor: string): unknown {
  try {
    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalidCursor();
  }
}

function decodeFeedCursor(cursor: string, sort: ArtworkListInput["sort"]): FeedCursor {
  const parsed = feedCursorSchema.safeParse(decodeJsonCursor(cursor));
  if (!parsed.success || parsed.data.sort !== sort) {
    return invalidCursor();
  }
  return parsed.data;
}

function decodeFavoriteCursor(cursor: string): FavoriteCursor {
  const parsed = favoriteCursorSchema.safeParse(decodeJsonCursor(cursor));
  if (!parsed.success) {
    return invalidCursor();
  }
  return parsed.data;
}

export async function hydrateCards(
  db: Database,
  rows: ArtworkRow[],
  userId?: string,
): Promise<ArtworkCard[]> {
  if (rows.length === 0) {
    return [];
  }

  const artworkIds = rows.map((row) => row.id);
  const [categoryRows, styleRows, favoriteRows] = await Promise.all([
    db
      .select({
        artworkId: artworkCategory.artworkId,
        slug: category.slug,
        name: category.name,
      })
      .from(artworkCategory)
      .innerJoin(category, eq(artworkCategory.categoryId, category.id))
      .where(inArray(artworkCategory.artworkId, artworkIds))
      .orderBy(asc(category.sortOrder), asc(category.name)),
    db
      .select({
        artworkId: artworkStyle.artworkId,
        slug: style.slug,
        name: style.name,
      })
      .from(artworkStyle)
      .innerJoin(style, eq(artworkStyle.styleId, style.id))
      .where(inArray(artworkStyle.artworkId, artworkIds))
      .orderBy(asc(style.sortOrder), asc(style.name)),
    userId
      ? db
          .select({ artworkId: favorite.artworkId })
          .from(favorite)
          .where(and(eq(favorite.userId, userId), inArray(favorite.artworkId, artworkIds)))
      : Promise.resolve([]),
  ]);

  const categoriesByArtwork = new Map<string, { slug: string; name: string }[]>();
  const stylesByArtwork = new Map<string, { slug: string; name: string }[]>();
  const favoriteIds = new Set(favoriteRows.map((row) => row.artworkId));

  for (const row of categoryRows) {
    const links = categoriesByArtwork.get(row.artworkId) ?? [];
    links.push({ slug: row.slug, name: row.name });
    categoriesByArtwork.set(row.artworkId, links);
  }

  for (const row of styleRows) {
    const links = stylesByArtwork.get(row.artworkId) ?? [];
    links.push({ slug: row.slug, name: row.name });
    stylesByArtwork.set(row.artworkId, links);
  }

  return rows.map(({ curatedAt: _curatedAt, imageFingerprint, thumbnailFingerprint, ...row }) => ({
    ...row,
    imageUrl: artworkArtifactUrl(env.BETTER_AUTH_URL, row.id, "full", imageFingerprint),
    thumbnailUrl: artworkArtifactUrl(
      env.BETTER_AUTH_URL,
      row.id,
      "thumbnail",
      thumbnailFingerprint,
    ),
    aspectRatio: row.imageWidth / row.imageHeight,
    category: categoriesByArtwork.get(row.id)?.[0]?.name ?? "Artwork",
    styles: stylesByArtwork.get(row.id) ?? [],
    isFavorite: favoriteIds.has(row.id),
  }));
}

function filterConditions(db: Database, input: ArtworkListInput): SQL[] {
  const conditions: SQL[] = [];

  if (input.category) {
    conditions.push(
      exists(
        db
          .select({ value: artworkCategory.artworkId })
          .from(artworkCategory)
          .innerJoin(category, eq(artworkCategory.categoryId, category.id))
          .where(and(eq(artworkCategory.artworkId, artwork.id), eq(category.slug, input.category))),
      ),
    );
  }

  if (input.gallery) {
    conditions.push(eq(gallery.slug, input.gallery));
  }

  if (input.style) {
    conditions.push(
      exists(
        db
          .select({ value: artworkStyle.artworkId })
          .from(artworkStyle)
          .innerJoin(style, eq(artworkStyle.styleId, style.id))
          .where(and(eq(artworkStyle.artworkId, artwork.id), eq(style.slug, input.style))),
      ),
    );
  }

  if (input.artist) {
    conditions.push(
      exists(
        db
          .select({ value: artworkArtist.artworkId })
          .from(artworkArtist)
          .innerJoin(artist, eq(artworkArtist.artistId, artist.id))
          .where(and(eq(artworkArtist.artworkId, artwork.id), eq(artist.slug, input.artist))),
      ),
    );
  }

  return conditions;
}

function cursorCondition(cursor: FeedCursor): SQL {
  if (cursor.sort === "recent") {
    const date = new Date(cursor.value);
    return or(
      lt(artwork.curatedAt, date),
      and(eq(artwork.curatedAt, date), lt(artwork.id, cursor.id)),
    )!;
  }

  const column = cursor.sort === "title" ? artwork.title : artwork.artist;
  return or(gt(column, cursor.value), and(eq(column, cursor.value), gt(artwork.id, cursor.id)))!;
}

function feedOrder(sort: ArtworkListInput["sort"]): [SQL, SQL] {
  if (sort === "recent") {
    return [desc(artwork.curatedAt), desc(artwork.id)];
  }
  const column = sort === "title" ? artwork.title : artwork.artist;
  return [asc(column), asc(artwork.id)];
}

function nextFeedCursor(row: ArtworkRow, sort: ArtworkListInput["sort"]): string {
  if (sort === "recent") {
    return encodeCursor({ sort, value: row.curatedAt.getTime(), id: row.id });
  }
  return encodeCursor({
    sort,
    value: sort === "title" ? row.title : row.artist,
    id: row.id,
  });
}

export async function listArtworkCards(db: Database, input: ArtworkListInput, userId?: string) {
  const conditions = filterConditions(db, input);
  if (input.cursor) {
    conditions.push(cursorCondition(decodeFeedCursor(input.cursor, input.sort)));
  }

  const rows = await db
    .select(artworkSelection)
    .from(artwork)
    .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
    .where(and(...conditions))
    .orderBy(...feedOrder(input.sort))
    .limit(input.limit + 1);

  const hasNextPage = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const items = await hydrateCards(db, pageRows, userId);
  const lastRow = pageRows.at(-1);

  return {
    items,
    nextCursor: hasNextPage && lastRow ? nextFeedCursor(lastRow, input.sort) : null,
  };
}

export const artworksRouter = {
  list: publicProcedure
    .input(artworkListInputSchema)
    .output(artworkPageSchema)
    .handler(({ context, input }) => listArtworkCards(context.db, input, context.session?.user.id)),

  bySlug: publicProcedure
    .input(browseSlugInputSchema)
    .output(
      z.object({
        artwork: artworkDetailSchema,
        related: z.array(artworkCardSchema),
      }),
    )
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          ...artworkSelection,
          description: artwork.description,
          medium: artwork.medium,
          dimensions: artwork.dimensions,
          creditLine: artwork.creditLine,
          galleryUrl: gallery.url,
          sourceName: source.name,
          sourceAttribution: source.attribution,
          sourceUrl: artwork.sourceUrl,
          imageSourceUrl: artwork.imageSourceUrl,
          imageAttribution: artwork.imageAttribution,
        })
        .from(artwork)
        .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
        .innerJoin(source, eq(artwork.sourceId, source.id))
        .where(eq(artwork.slug, input.slug))
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Artwork not found." });
      }

      const [card] = await hydrateCards(context.db, [row], context.session?.user.id);
      if (!card) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      const [categoryRows, styleIdRows] = await Promise.all([
        context.db
          .select({ slug: category.slug, name: category.name })
          .from(artworkCategory)
          .innerJoin(category, eq(artworkCategory.categoryId, category.id))
          .where(eq(artworkCategory.artworkId, row.id))
          .orderBy(asc(category.sortOrder), asc(category.name)),
        context.db
          .select({ id: artworkStyle.styleId })
          .from(artworkStyle)
          .where(eq(artworkStyle.artworkId, row.id)),
      ]);

      let relatedRows: ArtworkRow[] = [];
      const styleIds = styleIdRows.map((item) => item.id);
      if (styleIds.length > 0) {
        relatedRows = await context.db
          .select(artworkSelection)
          .from(artwork)
          .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
          .where(
            and(
              ne(artwork.id, row.id),
              exists(
                context.db
                  .select({ value: artworkStyle.artworkId })
                  .from(artworkStyle)
                  .where(
                    and(
                      eq(artworkStyle.artworkId, artwork.id),
                      inArray(artworkStyle.styleId, styleIds),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(desc(artwork.curatedAt), desc(artwork.id))
          .limit(8);
      }

      const related = await hydrateCards(context.db, relatedRows, context.session?.user.id);

      return {
        artwork: {
          ...card,
          description: row.description,
          medium: row.medium,
          dimensions: row.dimensions,
          creditLine: row.creditLine,
          galleryUrl: row.galleryUrl,
          categories: categoryRows,
          source: {
            name: row.sourceName,
            url: row.sourceUrl,
            attribution: row.sourceAttribution,
          },
          imageSource: {
            url: row.imageSourceUrl,
            attribution: row.imageAttribution,
          },
        },
        related,
      };
    }),

  categories: publicProcedure
    .output(
      z.object({
        categories: z.array(taxonomyLinkSchema),
        styles: z.array(taxonomyLinkSchema),
      }),
    )
    .handler(async ({ context }) => {
      const [categories, styles] = await Promise.all([
        context.db
          .select({ slug: category.slug, name: category.name })
          .from(category)
          .orderBy(asc(category.sortOrder), asc(category.name)),
        context.db
          .select({ slug: style.slug, name: style.name })
          .from(style)
          .orderBy(asc(style.sortOrder), asc(style.name)),
      ]);
      return { categories, styles };
    }),
};

const galleryCount = count(artwork.id);
const galleryCoverArtworkId = sql<string | null>`(
  select ${artwork.id}
  from ${artwork}
  where ${artwork.galleryId} = ${gallery.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;
const galleryCoverFingerprint = sql<string | null>`(
  select ${artwork.thumbnailFingerprint}
  from ${artwork}
  where ${artwork.galleryId} = ${gallery.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;

export const galleriesRouter = {
  list: publicProcedure
    .output(z.object({ items: z.array(gallerySummarySchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: gallery.id,
          slug: gallery.slug,
          name: gallery.name,
          location: gallery.location,
          url: gallery.url,
          description: gallery.description,
          artworkCount: galleryCount,
          coverArtworkId: galleryCoverArtworkId,
          coverFingerprint: galleryCoverFingerprint,
        })
        .from(gallery)
        .leftJoin(artwork, eq(gallery.id, artwork.galleryId))
        .groupBy(gallery.id)
        .orderBy(asc(gallery.name));

      const followed = context.session?.user.id
        ? new Set(
            (
              await context.db
                .select({ id: followedGallery.galleryId })
                .from(followedGallery)
                .where(eq(followedGallery.userId, context.session.user.id))
            ).map((item) => item.id),
          )
        : new Set<string>();
      return {
        items: rows.map(({ coverArtworkId, coverFingerprint, ...row }) => ({
          ...row,
          coverImageUrl:
            coverArtworkId && coverFingerprint
              ? artworkArtifactUrl(
                  env.BETTER_AUTH_URL,
                  coverArtworkId,
                  "thumbnail",
                  coverFingerprint,
                )
              : null,
          isFollowing: followed.has(row.id),
        })),
      };
    }),

  bySlug: publicProcedure
    .input(browseSlugInputSchema)
    .output(
      z.object({
        gallery: gallerySummarySchema.extend({
          source: z.object({
            name: z.string(),
            url: z.url(),
            attribution: z.string(),
          }),
        }),
      }),
    )
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          id: gallery.id,
          slug: gallery.slug,
          name: gallery.name,
          location: gallery.location,
          url: gallery.url,
          description: gallery.description,
          artworkCount: galleryCount,
          coverArtworkId: galleryCoverArtworkId,
          coverFingerprint: galleryCoverFingerprint,
          sourceName: source.name,
          sourceUrl: source.url,
          sourceAttribution: source.attribution,
        })
        .from(gallery)
        .innerJoin(source, eq(gallery.sourceId, source.id))
        .leftJoin(artwork, eq(gallery.id, artwork.galleryId))
        .where(eq(gallery.slug, input.slug))
        .groupBy(gallery.id)
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Gallery not found." });
      }

      return {
        gallery: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          location: row.location,
          url: row.url,
          description: row.description,
          artworkCount: row.artworkCount,
          coverImageUrl:
            row.coverArtworkId && row.coverFingerprint
              ? artworkArtifactUrl(
                  env.BETTER_AUTH_URL,
                  row.coverArtworkId,
                  "thumbnail",
                  row.coverFingerprint,
                )
              : null,
          source: {
            name: row.sourceName,
            url: row.sourceUrl,
            attribution: row.sourceAttribution,
          },
          isFollowing: context.session?.user.id
            ? Boolean(
                (
                  await context.db
                    .select({ id: followedGallery.galleryId })
                    .from(followedGallery)
                    .where(
                      and(
                        eq(followedGallery.userId, context.session.user.id),
                        eq(followedGallery.galleryId, row.id),
                      ),
                    )
                    .limit(1)
                )[0],
              )
            : false,
        },
      };
    }),
};

const artistCount = count(artworkArtist.artworkId);
const artistCoverArtworkId = sql<string | null>`(
  select ${artwork.id}
  from ${artwork}
  inner join ${artworkArtist} on ${artworkArtist.artworkId} = ${artwork.id}
  where ${artworkArtist.artistId} = ${artist.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;
const artistCoverFingerprint = sql<string | null>`(
  select ${artwork.thumbnailFingerprint}
  from ${artwork}
  inner join ${artworkArtist} on ${artworkArtist.artworkId} = ${artwork.id}
  where ${artworkArtist.artistId} = ${artist.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;

function artistSummary(
  row: {
    id: string;
    slug: string;
    name: string;
    description: string;
    artworkCount: number;
    coverArtworkId: string | null;
    coverFingerprint: string | null;
  },
  isFollowing = false,
) {
  const { coverArtworkId, coverFingerprint, ...summary } = row;
  return {
    ...summary,
    coverImageUrl:
      coverArtworkId && coverFingerprint
        ? artworkArtifactUrl(env.BETTER_AUTH_URL, coverArtworkId, "thumbnail", coverFingerprint)
        : null,
    isFollowing,
  };
}

export const artistsRouter = {
  list: publicProcedure
    .output(z.object({ items: z.array(artistSummarySchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: artist.id,
          slug: artist.slug,
          name: artist.name,
          description: artist.description,
          artworkCount: artistCount,
          coverArtworkId: artistCoverArtworkId,
          coverFingerprint: artistCoverFingerprint,
        })
        .from(artist)
        .leftJoin(artworkArtist, eq(artist.id, artworkArtist.artistId))
        .groupBy(artist.id)
        .orderBy(asc(artist.name));
      const followed = context.session?.user.id
        ? new Set(
            (
              await context.db
                .select({ id: followedArtist.artistId })
                .from(followedArtist)
                .where(eq(followedArtist.userId, context.session.user.id))
            ).map((item) => item.id),
          )
        : new Set<string>();
      return { items: rows.map((row) => artistSummary(row, followed.has(row.id))) };
    }),

  bySlug: publicProcedure
    .input(browseSlugInputSchema)
    .output(z.object({ artist: artistSummarySchema }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          id: artist.id,
          slug: artist.slug,
          name: artist.name,
          description: artist.description,
          artworkCount: artistCount,
          coverArtworkId: artistCoverArtworkId,
          coverFingerprint: artistCoverFingerprint,
        })
        .from(artist)
        .leftJoin(artworkArtist, eq(artist.id, artworkArtist.artistId))
        .where(eq(artist.slug, input.slug))
        .groupBy(artist.id)
        .limit(1);
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Artist not found." });
      const isFollowing = context.session?.user.id
        ? Boolean(
            (
              await context.db
                .select({ id: followedArtist.artistId })
                .from(followedArtist)
                .where(
                  and(
                    eq(followedArtist.userId, context.session.user.id),
                    eq(followedArtist.artistId, row.id),
                  ),
                )
                .limit(1)
            )[0],
          )
        : false;
      return { artist: artistSummary(row, isFollowing) };
    }),
};

const styleCount = count(artworkStyle.artworkId);
const styleCoverArtworkId = sql<string | null>`(
  select ${artwork.id}
  from ${artwork}
  inner join ${artworkStyle} on ${artworkStyle.artworkId} = ${artwork.id}
  where ${artworkStyle.styleId} = ${style.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;
const styleCoverFingerprint = sql<string | null>`(
  select ${artwork.thumbnailFingerprint}
  from ${artwork}
  inner join ${artworkStyle} on ${artworkStyle.artworkId} = ${artwork.id}
  where ${artworkStyle.styleId} = ${style.id}
  order by ${artwork.curatedAt} desc, ${artwork.id} desc
  limit 1
)`;

export const stylesRouter = {
  list: publicProcedure
    .output(z.object({ items: z.array(styleSummarySchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({
          id: style.id,
          slug: style.slug,
          name: style.name,
          description: style.description,
          artworkCount: styleCount,
          coverArtworkId: styleCoverArtworkId,
          coverFingerprint: styleCoverFingerprint,
        })
        .from(style)
        .leftJoin(artworkStyle, eq(style.id, artworkStyle.styleId))
        .groupBy(style.id)
        .orderBy(asc(style.sortOrder), asc(style.name));

      const followed = context.session?.user.id
        ? new Set(
            (
              await context.db
                .select({ id: followedStyle.styleId })
                .from(followedStyle)
                .where(eq(followedStyle.userId, context.session.user.id))
            ).map((item) => item.id),
          )
        : new Set<string>();
      return {
        items: rows.map(({ coverArtworkId, coverFingerprint, ...row }) => ({
          ...row,
          coverImageUrl:
            coverArtworkId && coverFingerprint
              ? artworkArtifactUrl(
                  env.BETTER_AUTH_URL,
                  coverArtworkId,
                  "thumbnail",
                  coverFingerprint,
                )
              : null,
          isFollowing: followed.has(row.id),
        })),
      };
    }),

  bySlug: publicProcedure
    .input(browseSlugInputSchema)
    .output(z.object({ style: styleSummarySchema }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          id: style.id,
          slug: style.slug,
          name: style.name,
          description: style.description,
          artworkCount: styleCount,
          coverArtworkId: styleCoverArtworkId,
          coverFingerprint: styleCoverFingerprint,
        })
        .from(style)
        .leftJoin(artworkStyle, eq(style.id, artworkStyle.styleId))
        .where(eq(style.slug, input.slug))
        .groupBy(style.id)
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Style not found." });
      }

      const { coverArtworkId, coverFingerprint, ...styleRow } = row;
      return {
        style: {
          ...styleRow,
          coverImageUrl:
            coverArtworkId && coverFingerprint
              ? artworkArtifactUrl(
                  env.BETTER_AUTH_URL,
                  coverArtworkId,
                  "thumbnail",
                  coverFingerprint,
                )
              : null,
          isFollowing: context.session?.user.id
            ? Boolean(
                (
                  await context.db
                    .select({ id: followedStyle.styleId })
                    .from(followedStyle)
                    .where(
                      and(
                        eq(followedStyle.userId, context.session.user.id),
                        eq(followedStyle.styleId, row.id),
                      ),
                    )
                    .limit(1)
                )[0],
              )
            : false,
        },
      };
    }),
};

export const favoritesRouter = {
  ids: protectedProcedure
    .output(z.object({ ids: z.array(z.string()) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select({ id: favorite.artworkId })
        .from(favorite)
        .where(eq(favorite.userId, context.session.user.id))
        .orderBy(desc(favorite.createdAt), desc(favorite.artworkId));
      return { ids: rows.map((row) => row.id) };
    }),

  list: protectedProcedure
    .input(favoritesListInputSchema)
    .output(artworkPageSchema)
    .handler(async ({ context, input }) => {
      const conditions: SQL[] = [eq(favorite.userId, context.session.user.id)];

      if (input.cursor) {
        const cursor = decodeFavoriteCursor(input.cursor);
        const date = new Date(cursor.value);
        conditions.push(
          or(
            lt(favorite.createdAt, date),
            and(eq(favorite.createdAt, date), lt(favorite.artworkId, cursor.id)),
          )!,
        );
      }

      const rows = await context.db
        .select({
          ...artworkSelection,
          favoriteCreatedAt: favorite.createdAt,
        })
        .from(favorite)
        .innerJoin(artwork, eq(favorite.artworkId, artwork.id))
        .innerJoin(gallery, eq(artwork.galleryId, gallery.id))
        .where(and(...conditions))
        .orderBy(desc(favorite.createdAt), desc(favorite.artworkId))
        .limit(input.limit + 1);

      const hasNextPage = rows.length > input.limit;
      const pageRows = rows.slice(0, input.limit);
      const items = await hydrateCards(
        context.db,
        pageRows.map(({ favoriteCreatedAt: _favoriteCreatedAt, ...row }) => row),
        context.session.user.id,
      );
      const lastRow = pageRows.at(-1);

      return {
        items,
        nextCursor:
          hasNextPage && lastRow
            ? encodeCursor({
                sort: "favorite",
                value: lastRow.favoriteCreatedAt.getTime(),
                id: lastRow.id,
              })
            : null,
      };
    }),

  toggle: protectedProcedure
    .input(favoriteToggleInputSchema)
    .output(z.object({ artworkId: z.string(), isFavorite: z.boolean() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const [artworkRow] = await context.db
        .select({ id: artwork.id })
        .from(artwork)
        .where(eq(artwork.id, input.artworkId))
        .limit(1);

      if (!artworkRow) {
        throw new ORPCError("NOT_FOUND", { message: "Artwork not found." });
      }

      const [existing] = await context.db
        .select({ artworkId: favorite.artworkId })
        .from(favorite)
        .where(and(eq(favorite.userId, userId), eq(favorite.artworkId, input.artworkId)))
        .limit(1);

      if (existing) {
        const removeFavorite = context.db
          .delete(favorite)
          .where(and(eq(favorite.userId, userId), eq(favorite.artworkId, input.artworkId)));
        const updateProfile = context.db
          .insert(tasteProfile)
          .values({ userId, revision: 1, artworkCount: 0 })
          .onConflictDoUpdate({
            target: tasteProfile.userId,
            set: {
              revision: sql`${tasteProfile.revision} + 1`,
              embedding: null,
              artworkCount: sql`(select count(*) from ${favorite} where ${favorite.userId} = ${userId})`,
              updatedAt: new Date(),
            },
          });
        await context.db.batch([removeFavorite, updateProfile]);
        return { artworkId: input.artworkId, isFavorite: false };
      }

      const addFavorite = context.db
        .insert(favorite)
        .values({ userId, artworkId: input.artworkId })
        .onConflictDoNothing();
      const updateProfile = context.db
        .insert(tasteProfile)
        .values({ userId, revision: 1, artworkCount: 1 })
        .onConflictDoUpdate({
          target: tasteProfile.userId,
          set: {
            revision: sql`${tasteProfile.revision} + 1`,
            embedding: null,
            artworkCount: sql`(select count(*) from ${favorite} where ${favorite.userId} = ${userId})`,
            updatedAt: new Date(),
          },
        });
      await context.db.batch([addFavorite, updateProfile]);

      return { artworkId: input.artworkId, isFavorite: true };
    }),
};
