import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { handleCatalogArtworkSearchRequest } from "./catalog";

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

describe("concise artwork search", () => {
  test("authorizes before database access", async () => {
    let touched = false;
    const response = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=starry", null),
      {
        database: {
          prepare() {
            touched = true;
          },
        },
        secret: SECRET,
      },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(touched).toBe(false);
  });

  test("searches stable identity and taxonomy fields without catalog version state", async () => {
    const byTitle = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=starry&limit=2"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(byTitle.status).toBe(200);
    expect(byTitle.headers.get("Cache-Control")).toBe("no-store");
    const byTitleBody = await byTitle.json();
    expect(byTitleBody).toEqual({
      artworks: [
        {
          id: "moma-starry-night",
          slug: "the-starry-night",
          title: "The Starry Night",
          artist: "Vincent van Gogh",
          sourceExternalId: "472.1941",
          sourceUrl: "https://www.moma.org/collection/works/79802",
          sourceSlug: "moma",
          gallerySlug: "moma",
          categorySlugs: ["painting"],
          styleSlugs: ["post-impressionism"],
        },
      ],
    });

    const bySource = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=79802"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await bySource.json()).artworks[0].id).toBe("moma-starry-night");

    const byStyle = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=post-impressionism"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await byStyle.json()).artworks.map((row) => row.id)).toContain("moma-starry-night");

    const references = byTitleBody.artworks[0];
    expect({
      source: references.sourceSlug,
      gallery: references.gallerySlug,
      categorySlugs: references.categorySlugs,
      styleSlugs: references.styleSlugs,
    }).toEqual({
      source: "moma",
      gallery: "moma",
      categorySlugs: ["painting"],
      styleSlugs: ["post-impressionism"],
    });

    const escapedWildcard = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=%25"),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(await escapedWildcard.json()).toEqual({ artworks: [] });
  });

  test("finds reusable references by exact source and gallery root URLs", async () => {
    const roots = ["https://source-root.example/", "https://gallery-root.example/"];
    sqlite.query("UPDATE source SET url = ? WHERE id = 'moma'").run(roots[0]);
    sqlite.query("UPDATE gallery SET url = ? WHERE id = 'moma'").run(roots[1]);

    for (const root of roots) {
      const response = await handleCatalogArtworkSearchRequest(
        request(`/internal/artworks?q=${encodeURIComponent(root)}`),
        { database: d1(sqlite), secret: SECRET },
      );
      expect(response.status).toBe(200);
      expect((await response.json()).artworks).toEqual([
        expect.objectContaining({
          id: "moma-starry-night",
          sourceSlug: "moma",
          gallerySlug: "moma",
          categorySlugs: ["painting"],
          styleSlugs: ["post-impressionism"],
        }),
      ]);
    }
  });

  test("keeps query and result size bounded", async () => {
    for (const path of ["/internal/artworks?q=", "/internal/artworks?q=art&limit=26"]) {
      const response = await handleCatalogArtworkSearchRequest(request(path), {
        database: d1(sqlite),
        secret: SECRET,
      });
      expect(response.status).toBe(400);
    }
  });

  test("orders reusable taxonomy slugs and caps them at the draft limits", async () => {
    const categories = [
      ["zebra", -2],
      ["alpha", -2],
      ["middle", -1],
      ["last", 0],
      ["omitted", 1],
    ];
    for (const [slug, sortOrder] of categories) {
      const id = `round3-category-${slug}`;
      sqlite
        .query(
          "INSERT INTO category (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)",
        )
        .run(id, `round3-${slug}`, slug, `${slug} category`, sortOrder);
      sqlite
        .query("INSERT INTO artwork_category (artwork_id, category_id) VALUES (?, ?)")
        .run("moma-starry-night", id);
    }
    for (let index = 9; index >= 1; index -= 1) {
      const id = `round3-style-${index}`;
      sqlite
        .query("INSERT INTO style (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)")
        .run(id, id, id, `${id} style`, -index);
      sqlite
        .query("INSERT INTO artwork_style (artwork_id, style_id) VALUES (?, ?)")
        .run("moma-starry-night", id);
    }

    const response = await handleCatalogArtworkSearchRequest(
      request("/internal/artworks?q=starry"),
      {
        database: d1(sqlite),
        secret: SECRET,
      },
    );
    const [result] = (await response.json()).artworks;
    expect(result.categorySlugs).toEqual([
      "round3-alpha",
      "round3-zebra",
      "round3-middle",
      "round3-last",
    ]);
    expect(result.styleSlugs).toEqual(
      Array.from({ length: 8 }, (_, index) => `round3-style-${9 - index}`),
    );
  });
});
