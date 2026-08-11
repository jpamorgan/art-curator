import type { ArtworkImportBatch } from "./import-artworks";
import { authorizeInternalJob } from "./internal-job-auth";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;

type CatalogDatabase = Pick<D1Database, "prepare">;

type CatalogDependencies = {
  database: CatalogDatabase;
  secret: string;
};

type ArtworkSearchRow = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  sourceExternalId: string;
  sourceUrl: string;
};

type ArtworkExportRow = {
  id: string;
  slug: string;
  source_external_id: string;
  title: string;
  artist: string;
  date_display: string;
  description: string;
  medium: string;
  dimensions: string;
  credit_line: string;
  source_url: string;
  image_id: string;
  image_url: string;
  thumbnail_url: string;
  image_source_url: string;
  image_attribution: string;
  image_source_version: string;
  thumbnail_source_version: string;
  image_width: number;
  image_height: number;
  alt: string;
  is_public_domain: number;
  curated_at: number;
  source_id: string;
  source_slug: string;
  source_name: string;
  source_kind: "museum" | "gallery" | "curation" | "social";
  source_home_url: string;
  source_attribution: string;
  source_terms_url: string;
  gallery_id: string;
  gallery_slug: string;
  gallery_name: string;
  gallery_location: string;
  gallery_description: string;
  gallery_url: string;
};

type TaxonomyRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
};

class CatalogRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}

async function catalogVersion(database: CatalogDatabase): Promise<number> {
  const row = await database
    .prepare("SELECT version FROM catalog_state WHERE id = 1")
    .first<{ version: number }>();
  if (!row || !Number.isSafeInteger(row.version) || row.version < 1) {
    throw new CatalogRequestError(503, "catalog_unavailable");
  }
  return row.version;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request, secret: string): Promise<void> {
  const result = await authorizeInternalJob(request, secret);
  if (result === "not_configured") {
    throw new CatalogRequestError(503, "catalog_not_configured");
  }
  if (result === "unauthorized") throw new CatalogRequestError(401, "unauthorized");
}

function escapedLike(value: string): string {
  return value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
}

function validArtworkId(value: string): boolean {
  return value.length <= 96 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export async function handleCatalogArtworkSearchRequest(
  request: Request,
  dependencies: CatalogDependencies,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_SEARCH_LIMIT : Number(rawLimit);
    if (query.length < 1 || query.length > 200) {
      throw new CatalogRequestError(400, "invalid_query");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      throw new CatalogRequestError(400, "invalid_limit");
    }

    const currentCatalogVersion = await catalogVersion(dependencies.database);
    const match = `%${escapedLike(query)}%`;
    const rows = await dependencies.database
      .prepare(
        `SELECT a.id, a.slug, a.title, a.artist,
           a.source_external_id AS sourceExternalId, a.source_url AS sourceUrl
         FROM artwork a
         INNER JOIN source source_entity ON source_entity.id = a.source_id
         INNER JOIN gallery gallery_entity ON gallery_entity.id = a.gallery_id
         WHERE a.id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.artist LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.source_url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.source_external_id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR source_entity.id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR source_entity.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR source_entity.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR source_entity.url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR gallery_entity.id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR gallery_entity.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR gallery_entity.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR gallery_entity.url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR EXISTS (
              SELECT 1 FROM artwork_category ac
              INNER JOIN category c ON c.id = ac.category_id
              WHERE ac.artwork_id = a.id AND (
                c.id LIKE ? ESCAPE '!' COLLATE NOCASE
                OR c.slug LIKE ? ESCAPE '!' COLLATE NOCASE
                OR c.name LIKE ? ESCAPE '!' COLLATE NOCASE
              )
            )
            OR EXISTS (
              SELECT 1 FROM artwork_style ars
              INNER JOIN style style_entity ON style_entity.id = ars.style_id
              WHERE ars.artwork_id = a.id AND (
                style_entity.id LIKE ? ESCAPE '!' COLLATE NOCASE
                OR style_entity.slug LIKE ? ESCAPE '!' COLLATE NOCASE
                OR style_entity.name LIKE ? ESCAPE '!' COLLATE NOCASE
              )
            )
         ORDER BY CASE
           WHEN a.id = ? COLLATE NOCASE OR a.slug = ? COLLATE NOCASE THEN 0 ELSE 1 END,
           a.title COLLATE NOCASE, a.id
         LIMIT ?`,
      )
      .bind(...Array.from({ length: 20 }, () => match), query, query, limit)
      .all<ArtworkSearchRow>();
    return json({ catalogVersion: currentCatalogVersion, artworks: rows.results });
  } catch (error) {
    if (error instanceof CatalogRequestError) {
      return json({ error: error.code }, error.status);
    }
    console.error("Catalog artwork search failed", error);
    return json({ error: "catalog_unavailable" }, 503);
  }
}

export async function handleCatalogArtworkExportRequest(
  request: Request,
  id: string,
  dependencies: CatalogDependencies,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    if (!validArtworkId(id)) throw new CatalogRequestError(404, "artwork_not_found");
    const currentCatalogVersion = await catalogVersion(dependencies.database);

    const row = await dependencies.database
      .prepare(
        `SELECT a.id, a.slug, a.source_external_id, a.title, a.artist, a.date_display,
           a.description, a.medium, a.dimensions, a.credit_line, a.source_url, a.image_id,
           a.image_url, a.thumbnail_url, a.image_source_url, a.image_attribution,
           a.image_source_version, a.thumbnail_source_version, a.image_width, a.image_height,
           a.alt, a.is_public_domain, a.curated_at,
           s.id AS source_id, s.slug AS source_slug, s.name AS source_name,
           s.kind AS source_kind, s.url AS source_home_url,
           s.attribution AS source_attribution, s.terms_url AS source_terms_url,
           g.id AS gallery_id, g.slug AS gallery_slug, g.name AS gallery_name,
           g.location AS gallery_location, g.description AS gallery_description,
           g.url AS gallery_url
         FROM artwork a
         INNER JOIN source s ON s.id = a.source_id
         INNER JOIN gallery g ON g.id = a.gallery_id
         WHERE a.id = ? LIMIT 1`,
      )
      .bind(id)
      .first<ArtworkExportRow>();
    if (!row) throw new CatalogRequestError(404, "artwork_not_found");

    const [categoryRows, styleRows] = await Promise.all([
      dependencies.database
        .prepare(
          `SELECT c.id, c.slug, c.name, c.description, c.sort_order
           FROM artwork_category ac
           INNER JOIN category c ON c.id = ac.category_id
           WHERE ac.artwork_id = ? ORDER BY c.sort_order, c.name`,
        )
        .bind(id)
        .all<TaxonomyRow>(),
      dependencies.database
        .prepare(
          `SELECT s.id, s.slug, s.name, s.description, s.sort_order
           FROM artwork_style ars
           INNER JOIN style s ON s.id = ars.style_id
           WHERE ars.artwork_id = ? ORDER BY s.sort_order, s.name`,
        )
        .bind(id)
        .all<TaxonomyRow>(),
    ]);

    const batch: ArtworkImportBatch = {
      sources: [
        {
          id: row.source_id,
          slug: row.source_slug,
          name: row.source_name,
          kind: row.source_kind,
          url: row.source_home_url,
          attribution: row.source_attribution,
          termsUrl: row.source_terms_url,
        },
      ],
      galleries: [
        {
          id: row.gallery_id,
          slug: row.gallery_slug,
          sourceSlug: row.source_slug,
          name: row.gallery_name,
          location: row.gallery_location,
          description: row.gallery_description,
          url: row.gallery_url,
        },
      ],
      categories: categoryRows.results.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        sortOrder: item.sort_order,
      })),
      styles: styleRows.results.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        sortOrder: item.sort_order,
      })),
      artworks: [
        {
          id: row.id,
          slug: row.slug,
          sourceSlug: row.source_slug,
          gallerySlug: row.gallery_slug,
          sourceExternalId: row.source_external_id,
          title: row.title,
          artist: row.artist,
          dateDisplay: row.date_display,
          description: row.description,
          medium: row.medium,
          dimensions: row.dimensions,
          creditLine: row.credit_line,
          sourceUrl: row.source_url,
          imageId: row.image_id,
          imageSourceUrl: row.image_source_url,
          imageAttribution: row.image_attribution,
          imageWidth: row.image_width,
          imageHeight: row.image_height,
          alt: row.alt,
          isPublicDomain: row.is_public_domain === 1,
          curatedAt: new Date(row.curated_at).toISOString(),
          categorySlugs: categoryRows.results.map((item) => item.slug),
          styleSlugs: styleRows.results.map((item) => item.slug),
          artifacts: {
            full: { url: row.image_url, version: row.image_source_version },
            thumbnail: { url: row.thumbnail_url, version: row.thumbnail_source_version },
          },
        },
      ],
    };
    return json({ expectedCatalogVersion: currentCatalogVersion, batch });
  } catch (error) {
    if (error instanceof CatalogRequestError) {
      return json({ error: error.code }, error.status);
    }
    console.error("Catalog artwork export failed", error);
    return json({ error: "catalog_unavailable" }, 503);
  }
}
