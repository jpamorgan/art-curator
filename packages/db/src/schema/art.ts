import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

export const source = sqliteTable(
  "source",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["museum", "gallery", "curation", "social"],
    }).notNull(),
    url: text("url").notNull(),
    attribution: text("attribution").notNull(),
    termsUrl: text("terms_url").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("source_slug_unique").on(table.slug),
    check("source_kind_check", sql`${table.kind} in ('museum', 'gallery', 'curation', 'social')`),
  ],
);

export const gallery = sqliteTable(
  "gallery",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    description: text("description").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("gallery_slug_unique").on(table.slug),
    index("gallery_source_idx").on(table.sourceId),
  ],
);

export const artwork = sqliteTable(
  "artwork",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    galleryId: text("gallery_id")
      .notNull()
      .references(() => gallery.id, { onDelete: "cascade" }),
    sourceExternalId: text("source_external_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    dateDisplay: text("date_display").notNull(),
    description: text("description").notNull(),
    medium: text("medium").notNull(),
    dimensions: text("dimensions").notNull(),
    creditLine: text("credit_line").notNull(),
    sourceUrl: text("source_url").notNull(),
    imageId: text("image_id").notNull(),
    upstreamImageUrl: text("image_url").notNull(),
    upstreamThumbnailUrl: text("thumbnail_url").notNull(),
    imageSourceUrl: text("image_source_url").default("").notNull(),
    imageAttribution: text("image_attribution").default("").notNull(),
    imageSourceVersion: text("image_source_version").default("").notNull(),
    thumbnailSourceVersion: text("thumbnail_source_version").default("").notNull(),
    imageFingerprint: text("image_fingerprint").default("").notNull(),
    thumbnailFingerprint: text("thumbnail_fingerprint").default("").notNull(),
    imageR2Key: text("image_r2_key").default("").notNull(),
    thumbnailR2Key: text("thumbnail_r2_key").default("").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    alt: text("alt").notNull(),
    isPublicDomain: integer("is_public_domain", { mode: "boolean" }).default(false).notNull(),
    curatedAt: integer("curated_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at").$onUpdate(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    uniqueIndex("artwork_slug_unique").on(table.slug),
    uniqueIndex("artwork_source_external_unique").on(table.sourceId, table.sourceExternalId),
    index("artwork_source_idx").on(table.sourceId),
    index("artwork_gallery_idx").on(table.galleryId),
    index("artwork_gallery_recent_idx").on(table.galleryId, table.curatedAt, table.id),
    index("artwork_recent_idx").on(table.curatedAt, table.id),
    index("artwork_title_idx").on(table.title, table.id),
    index("artwork_artist_idx").on(table.artist, table.id),
    check("artwork_image_width_check", sql`${table.imageWidth} > 0`),
    check("artwork_image_height_check", sql`${table.imageHeight} > 0`),
  ],
);

export const category = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("category_slug_unique").on(table.slug),
    index("category_sort_idx").on(table.sortOrder, table.name),
  ],
);

export const style = sqliteTable(
  "style",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("style_slug_unique").on(table.slug),
    index("style_sort_idx").on(table.sortOrder, table.name),
  ],
);

export const artworkCategory = sqliteTable(
  "artwork_category",
  {
    artworkId: text("artwork_id")
      .notNull()
      .references(() => artwork.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.artworkId, table.categoryId] }),
    index("artwork_category_category_idx").on(table.categoryId, table.artworkId),
  ],
);

export const artworkStyle = sqliteTable(
  "artwork_style",
  {
    artworkId: text("artwork_id")
      .notNull()
      .references(() => artwork.id, { onDelete: "cascade" }),
    styleId: text("style_id")
      .notNull()
      .references(() => style.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.artworkId, table.styleId] }),
    index("artwork_style_style_idx").on(table.styleId, table.artworkId),
  ],
);

export const favorite = sqliteTable(
  "favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    artworkId: text("artwork_id")
      .notNull()
      .references(() => artwork.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.artworkId] }),
    index("favorite_user_recent_idx").on(table.userId, table.createdAt, table.artworkId),
    index("favorite_artwork_idx").on(table.artworkId),
  ],
);

export const artInbox = sqliteTable(
  "art_inbox",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("art_inbox_url_unique").on(table.url),
    index("art_inbox_created_idx").on(table.createdAt, table.id),
    check("art_inbox_url_length_check", sql`length(${table.url}) between 1 and 2048`),
  ],
);

export const catalogState = sqliteTable(
  "catalog_state",
  {
    id: integer("id").primaryKey(),
    version: integer("version").notNull(),
  },
  (table) => [
    check("catalog_state_singleton_check", sql`${table.id} = 1`),
    check("catalog_state_version_check", sql`${table.version} > 0`),
  ],
);

export const catalogImportGuard = sqliteTable(
  "catalog_import_guard",
  {
    id: integer("id").primaryKey(),
    valid: integer("valid").notNull(),
  },
  (table) => [
    check("catalog_import_guard_singleton_check", sql`${table.id} = 1`),
    check("catalog_import_guard_valid_check", sql`${table.valid} = 1`),
  ],
);

export const sourceRelations = relations(source, ({ many }) => ({
  artworks: many(artwork),
  galleries: many(gallery),
}));

export const galleryRelations = relations(gallery, ({ many, one }) => ({
  source: one(source, {
    fields: [gallery.sourceId],
    references: [source.id],
  }),
  artworks: many(artwork),
}));

export const artworkRelations = relations(artwork, ({ many, one }) => ({
  source: one(source, {
    fields: [artwork.sourceId],
    references: [source.id],
  }),
  gallery: one(gallery, {
    fields: [artwork.galleryId],
    references: [gallery.id],
  }),
  categories: many(artworkCategory),
  styles: many(artworkStyle),
  favorites: many(favorite),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  artworks: many(artworkCategory),
}));

export const styleRelations = relations(style, ({ many }) => ({
  artworks: many(artworkStyle),
}));

export const artworkCategoryRelations = relations(artworkCategory, ({ one }) => ({
  artwork: one(artwork, {
    fields: [artworkCategory.artworkId],
    references: [artwork.id],
  }),
  category: one(category, {
    fields: [artworkCategory.categoryId],
    references: [category.id],
  }),
}));

export const artworkStyleRelations = relations(artworkStyle, ({ one }) => ({
  artwork: one(artwork, {
    fields: [artworkStyle.artworkId],
    references: [artwork.id],
  }),
  style: one(style, {
    fields: [artworkStyle.styleId],
    references: [style.id],
  }),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  user: one(user, {
    fields: [favorite.userId],
    references: [user.id],
  }),
  artwork: one(artwork, {
    fields: [favorite.artworkId],
    references: [artwork.id],
  }),
}));
