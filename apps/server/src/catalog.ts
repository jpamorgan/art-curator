import { authorizeInternalJob } from "./internal-job-auth";

const DEFAULT_SEARCH_LIMIT = 10,
  MAX_SEARCH_LIMIT = 25;

type CatalogDatabase = Pick<D1Database, "prepare">;

type CatalogDependencies = {
  database: CatalogDatabase;
  secret: string;
};

type ArtworkSearchDatabaseRow = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  sourceExternalId: string;
  sourceUrl: string;
  sourceSlug: string;
  gallerySlug: string;
  categorySlugs: string;
  styleSlugs: string;
};

function escapedLike(value: string): string {
  return value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
}

export async function handleCatalogArtworkSearchRequest(
  request: Request,
  dependencies: CatalogDependencies,
): Promise<Response> {
  try {
    const authorization = await authorizeInternalJob(request, dependencies.secret);
    if (authorization !== "authorized") {
      return Response.json(
        { error: authorization === "unauthorized" ? "unauthorized" : "catalog_not_configured" },
        { status: authorization === "unauthorized" ? 401 : 503 },
      );
    }
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_SEARCH_LIMIT : Number(rawLimit);
    if (query.length < 1 || query.length > 200) {
      return Response.json({ error: "invalid_query" }, { status: 400 });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
      return Response.json({ error: "invalid_limit" }, { status: 400 });
    }

    const match = `%${escapedLike(query)}%`;
    const rows = await dependencies.database
      .prepare(
        `SELECT a.id, a.slug, a.title, a.artist,
           a.source_external_id AS sourceExternalId, a.source_url AS sourceUrl,
           s.slug AS sourceSlug, g.slug AS gallerySlug,
           COALESCE((
             SELECT group_concat(slug, char(31)) FROM (
               SELECT c.slug AS slug
               FROM artwork_category ac
               INNER JOIN category c ON c.id = ac.category_id
               WHERE ac.artwork_id = a.id
               ORDER BY c.sort_order, c.slug
               LIMIT 4
             )
           ), '') AS categorySlugs,
           COALESCE((
             SELECT group_concat(slug, char(31)) FROM (
               SELECT style_entity.slug AS slug
               FROM artwork_style ars
               INNER JOIN style style_entity ON style_entity.id = ars.style_id
               WHERE ars.artwork_id = a.id
               ORDER BY style_entity.sort_order, style_entity.slug
               LIMIT 8
             )
           ), '') AS styleSlugs
         FROM artwork a
         INNER JOIN source s ON s.id = a.source_id
         INNER JOIN gallery g ON g.id = a.gallery_id
         WHERE a.id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.artist LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.source_url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR a.source_external_id LIKE ? ESCAPE '!' COLLATE NOCASE
            OR s.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR s.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR s.url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR g.slug LIKE ? ESCAPE '!' COLLATE NOCASE
            OR g.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR g.url LIKE ? ESCAPE '!' COLLATE NOCASE
            OR EXISTS (
              SELECT 1 FROM artwork_category ac
              INNER JOIN category c ON c.id = ac.category_id
              WHERE ac.artwork_id = a.id AND (
                c.slug LIKE ? ESCAPE '!' COLLATE NOCASE
                OR c.name LIKE ? ESCAPE '!' COLLATE NOCASE
              )
            )
            OR EXISTS (
              SELECT 1 FROM artwork_style ars
              INNER JOIN style style_entity ON style_entity.id = ars.style_id
              WHERE ars.artwork_id = a.id AND (
                style_entity.slug LIKE ? ESCAPE '!' COLLATE NOCASE
                OR style_entity.name LIKE ? ESCAPE '!' COLLATE NOCASE
              )
            )
         ORDER BY CASE
           WHEN a.id = ? COLLATE NOCASE OR a.slug = ? COLLATE NOCASE THEN 0 ELSE 1 END,
           a.title COLLATE NOCASE, a.id
         LIMIT ?`,
      )
      .bind(...Array.from({ length: 16 }, () => match), query, query, limit)
      .all<ArtworkSearchDatabaseRow>();
    const artworks = rows.results.map(({ categorySlugs, styleSlugs, ...artwork }) => ({
      ...artwork,
      categorySlugs: categorySlugs ? categorySlugs.split("\u001f") : [],
      styleSlugs: styleSlugs ? styleSlugs.split("\u001f") : [],
    }));
    return Response.json({ artworks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Catalog artwork search failed", error);
    return Response.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}
