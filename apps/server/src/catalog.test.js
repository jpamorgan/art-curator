import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { handleCatalogArtworkExportRequest, handleCatalogArtworkSearchRequest } from "./catalog";
import { artworkImportRequestSchema } from "./import-artworks";

const SECRET = "art_import_test_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const migrationFiles = [
  "0000_good_kabuki.sql",
  "0001_seed_curated_artworks.sql",
  "0002_early_iron_fist.sql",
  "0003_curated_artifact_seed.sql",
  "0004_slim_zarek.sql",
  "0005_tired_reavers.sql",
  "0006_nappy_marvex.sql",
  "0007_classy_ma_gnuci.sql",
];
let sqlite;

class TestPreparedStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new TestPreparedStatement(this.database, this.sql, values);
  }

  async first() {
    return this.database.query(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { results: this.database.query(this.sql).all(...this.values) };
  }
}

function d1(database) {
  return {
    prepare(sql) {
      return new TestPreparedStatement(database, sql);
    },
  };
}

function request(path, authorization = `Bearer ${SECRET}`) {
  const headers = new Headers();
  if (authorization !== null) headers.set("Authorization", authorization);
  return new Request(`https://api.art.jpamorgan.com${path}`, { headers });
}

beforeEach(async () => {
  sqlite = new Database(":memory:");
  for (const name of migrationFiles) {
    const migration = await Bun.file(
      `${import.meta.dir}/../../../packages/db/src/migrations/${name}`,
    ).text();
    for (const statement of migration
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }
});

afterEach(() => sqlite.close());

describe("secret catalog artwork boundary", () => {
  test("authorizes search and export before database access", async () => {
    let touched = false;
    const database = {
      prepare() {
        touched = true;
        throw new Error("must not be reached");
      },
    };
    const search = await handleCatalogArtworkSearchRequest(
      request("/internal/catalog/artworks?q=starry", null),
      { database, secret: SECRET },
    );
    const exported = await handleCatalogArtworkExportRequest(
      request("/internal/catalog/artworks/moma-starry-night", "Bearer incorrect_secret_value"),
      "moma-starry-night",
      { database, secret: SECRET },
    );
    expect(search.status).toBe(401);
    expect(exported.status).toBe(401);
    expect(touched).toBe(false);
  });

  test("searches stable identity fields with an exact bounded response", async () => {
    const byTitle = await handleCatalogArtworkSearchRequest(
      request("/internal/catalog/artworks?q=starry&limit=2"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(byTitle.status).toBe(200);
    expect(byTitle.headers.get("Cache-Control")).toBe("no-store");
    expect(await byTitle.json()).toEqual({
      catalogVersion: 1,
      artworks: [
        {
          id: "moma-starry-night",
          slug: "the-starry-night",
          title: "The Starry Night",
          artist: "Vincent van Gogh",
          sourceExternalId: "472.1941",
          sourceUrl: "https://www.moma.org/collection/works/79802",
        },
      ],
    });

    const bySource = await handleCatalogArtworkSearchRequest(
      request("/internal/catalog/artworks?q=79802"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await bySource.json()).artworks[0].id).toBe("moma-starry-night");

    const byRelatedStyle = await handleCatalogArtworkSearchRequest(
      request("/internal/catalog/artworks?q=post-impressionism"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await byRelatedStyle.json()).artworks.map((row) => row.id)).toContain(
      "moma-starry-night",
    );

    const escapedWildcard = await handleCatalogArtworkSearchRequest(
      request("/internal/catalog/artworks?q=%25"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(await escapedWildcard.json()).toEqual({ catalogVersion: 1, artworks: [] });
    for (const path of [
      "/internal/catalog/artworks?q=",
      "/internal/catalog/artworks?q=art&limit=26",
    ]) {
      expect(
        (
          await handleCatalogArtworkSearchRequest(request(path), {
            database: d1(sqlite),
            secret: SECRET,
          })
        ).status,
      ).toBe(400);
    }
  });

  test("exports a complete import-ready normalized batch", async () => {
    const response = await handleCatalogArtworkExportRequest(
      request("/internal/catalog/artworks/moma-starry-night"),
      "moma-starry-night",
      { database: d1(sqlite), secret: SECRET },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(artworkImportRequestSchema.safeParse(body).success).toBe(true);
    expect(body.expectedCatalogVersion).toBe(1);
    expect(body.batch).toMatchObject({
      sources: [{ id: "moma", slug: "moma" }],
      galleries: [{ id: "moma", slug: "moma", sourceSlug: "moma" }],
      categories: [{ id: "category-painting", slug: "painting" }],
      styles: [{ id: "style-post-impressionism", slug: "post-impressionism" }],
      artworks: [
        {
          id: "moma-starry-night",
          slug: "the-starry-night",
          sourceSlug: "moma",
          gallerySlug: "moma",
          sourceExternalId: "472.1941",
          artifacts: {
            full: { version: "seed-2026-08-10-v1" },
            thumbnail: { version: "seed-2026-08-10-v1" },
          },
        },
      ],
    });
  });

  test("returns a quiet 404 for an unknown or invalid artwork id", async () => {
    for (const id of ["missing-artwork", "../unsafe"]) {
      const response = await handleCatalogArtworkExportRequest(
        request(`/internal/catalog/artworks/${id}`),
        id,
        { database: d1(sqlite), secret: SECRET },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "artwork_not_found" });
    }
  });
});
