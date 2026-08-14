import type { ArtworkDatabase, ArtworkDraft } from "./artwork-contract";
import { ArtworkRequestError } from "./artwork-contract";

export function prepared(database: ArtworkDatabase, sql: string, values: unknown[]) {
  return database.prepare(sql).bind(...values);
}

export function slugify(value: string, fallback = "artwork") {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 96)
      .replace(/-$/g, "") || fallback
  );
}

export async function sha256(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function derivedId(label: string, identity: string) {
  const base = slugify(label).slice(0, 79).replace(/-$/g, "");
  return `${base}-${(await sha256(identity)).slice(0, 16)}`;
}

type EntityPlan = {
  table: "source" | "gallery";
  columns: string[];
  values: unknown[];
  url: string;
};

async function resolveUrlEntity(database: ArtworkDatabase, plan: EntityPlan) {
  const rows = await database
    .prepare(`SELECT id, ${plan.columns.join(", ")} FROM ${plan.table} WHERE url = ?`)
    .bind(plan.url)
    .all<Record<string, unknown>>();
  if (rows.results.length) {
    const exact =
      rows.results.length === 1 &&
      plan.columns.every((column, index) => rows.results[0]![column] === plan.values[index]);
    if (!exact) throw new ArtworkRequestError(409, "artwork_conflict");
    return { id: String(rows.results[0]!.id), inserts: [] as D1PreparedStatement[] };
  }
  const id = `${plan.table}-${(await sha256(plan.url)).slice(0, 16)}`;
  const columns = ["id", "slug", ...plan.columns];
  return {
    id,
    inserts: [
      prepared(
        database,
        `INSERT INTO ${plan.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        [id, id, ...plan.values],
      ),
    ],
  };
}

async function resolveSource(database: ArtworkDatabase, ref: ArtworkDraft["source"]) {
  if (typeof ref === "string") {
    const row = await database
      .prepare("SELECT id FROM source WHERE slug = ? LIMIT 1")
      .bind(ref)
      .first<{ id: string }>();
    if (!row) throw new ArtworkRequestError(422, "invalid_artwork");
    return { id: row.id, inserts: [] as D1PreparedStatement[] };
  }
  const source = { ...ref.create, termsUrl: ref.create.termsUrl ?? ref.create.url };
  return resolveUrlEntity(database, {
    table: "source",
    url: source.url,
    columns: ["name", "kind", "url", "attribution", "terms_url"],
    values: [source.name, source.kind, source.url, source.attribution, source.termsUrl],
  });
}

async function resolveGallery(
  database: ArtworkDatabase,
  sourceId: string,
  ref: ArtworkDraft["gallery"],
) {
  if (typeof ref === "string") {
    const row = await database
      .prepare("SELECT id FROM gallery WHERE slug = ? AND source_id = ? LIMIT 1")
      .bind(ref, sourceId)
      .first<{ id: string }>();
    if (!row) throw new ArtworkRequestError(422, "invalid_artwork");
    return { id: row.id, inserts: [] as D1PreparedStatement[] };
  }
  const gallery = ref.create;
  return resolveUrlEntity(database, {
    table: "gallery",
    url: gallery.url,
    columns: ["source_id", "name", "location", "description", "url"],
    values: [sourceId, gallery.name, gallery.location, gallery.description, gallery.url],
  });
}

async function taxonomy(database: ArtworkDatabase, table: "category" | "style", slugs: string[]) {
  const rows = await database
    .prepare(`SELECT id, slug FROM ${table} WHERE slug IN (${slugs.map(() => "?").join(",")})`)
    .bind(...slugs)
    .all<{ id: string; slug: string }>();
  const ids = new Map(rows.results.map((row) => [row.slug, row.id]));
  if (ids.size !== slugs.length) throw new ArtworkRequestError(422, "invalid_artwork");
  return ids;
}

export async function resolveSharedEntities(database: ArtworkDatabase, draft: ArtworkDraft) {
  const source = await resolveSource(database, draft.source);
  const gallery = await resolveGallery(database, source.id, draft.gallery);
  const [categoryIds, styleIds] = await Promise.all([
    taxonomy(database, "category", draft.categorySlugs),
    taxonomy(database, "style", draft.styleSlugs),
  ]);
  return {
    sourceId: source.id,
    galleryId: gallery.id,
    categoryIds,
    styleIds,
    inserts: [...source.inserts, ...gallery.inserts],
  };
}

export type SharedEntities = Awaited<ReturnType<typeof resolveSharedEntities>>;
