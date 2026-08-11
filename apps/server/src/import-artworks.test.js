import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { ARTIFACT_CONTENT_TYPE } from "@art/db/artifacts";

import { handleArtworkImportRequest } from "./import-artworks";

const SECRET = "art_import_test_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const migrationFiles = [
  "0000_good_kabuki.sql",
  "0001_seed_curated_artworks.sql",
  "0002_early_iron_fist.sql",
  "0003_curated_artifact_seed.sql",
  "0004_slim_zarek.sql",
];
let sqlite;

async function migrate(database) {
  for (const name of migrationFiles) {
    const sql = await Bun.file(
      `${import.meta.dir}/../../../packages/db/src/migrations/${name}`,
    ).text();
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("BEGIN");
    try {
      for (const statement of statements) database.exec(statement);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

class TestPreparedStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new TestPreparedStatement(this.database, this.sql, values);
  }

  execute() {
    this.database.query(this.sql).run(...this.values);
    return { success: true };
  }
}

function d1(database) {
  return {
    prepare(sql) {
      return new TestPreparedStatement(database, sql);
    },
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function jpegBytes(marker = 0) {
  const bytes = new Uint8Array(1_024);
  bytes.set([0xff, 0xd8, 0xff, marker]);
  return bytes;
}

function r2() {
  const objects = new Map();
  const calls = { head: 0, put: 0 };
  return {
    calls,
    objects,
    value: {
      async head(key) {
        calls.head += 1;
        return objects.get(key) ?? null;
      },
      async put(key, value, options) {
        calls.put += 1;
        objects.set(key, {
          key,
          size: value.byteLength,
          httpMetadata: { ...options.httpMetadata },
          customMetadata: { ...options.customMetadata },
        });
      },
    },
  };
}

function validBatch() {
  const sources = ["museum", "gallery", "curation", "social"].map((kind) => ({
    id: `dynamic-${kind}`,
    slug: `dynamic-${kind}`,
    name: `Dynamic ${kind}`,
    kind,
    url: `https://${kind}.example.com/`,
    attribution: `${kind} source attribution`,
    termsUrl: `https://${kind}.example.com/terms`,
  }));
  const galleries = sources.map((source) => ({
    id: `${source.id}-space`,
    slug: `${source.slug}-space`,
    sourceSlug: source.slug,
    name: `${source.name} Space`,
    location: "New York, US",
    description: `A normalized space for the ${source.kind} source.`,
    url: `${source.url}space`,
  }));
  return {
    sources,
    galleries,
    categories: [
      {
        id: "dynamic-category-painting",
        slug: "dynamic-painting",
        name: "Painting",
        description: "Paint applied to a physical surface.",
        sortOrder: 10,
      },
      {
        id: "dynamic-category-new-media",
        slug: "dynamic-new-media",
        name: "New media",
        description: "Physical work shaped by contemporary media.",
        sortOrder: 20,
      },
    ],
    styles: [
      {
        id: "dynamic-style-abstract",
        slug: "dynamic-abstract",
        name: "Abstract",
        description: "Non-representational form and color.",
        sortOrder: 10,
      },
      {
        id: "dynamic-style-conceptual",
        slug: "dynamic-conceptual",
        name: "Conceptual",
        description: "Ideas lead the form of the work.",
        sortOrder: 20,
      },
    ],
    artworks: [
      {
        id: "dynamic-rhythm-study",
        slug: "dynamic-rhythm-study",
        sourceSlug: "dynamic-social",
        gallerySlug: "dynamic-social-space",
        sourceExternalId: "social-post-4242",
        title: "Rhythm Study",
        artist: "Avery Hart",
        dateDisplay: "2026",
        description: "Layered pigment and graphite organize a quiet repeated rhythm.",
        medium: "Pigment and graphite on linen",
        dimensions: "122 × 91 cm",
        creditLine: "Courtesy of the artist",
        sourceUrl: "https://social.example.com/works/4242",
        imageId: "social-image-4242",
        imageSourceUrl: "https://social.example.com/works/4242/image-credit",
        imageAttribution: "Image courtesy of Avery Hart.",
        imageWidth: 1_600,
        imageHeight: 1_200,
        alt: "Layered blue and ochre marks on linen.",
        isPublicDomain: false,
        curatedAt: "2026-08-10T18:00:00.000Z",
        categorySlugs: ["dynamic-painting", "dynamic-new-media"],
        styleSlugs: ["dynamic-abstract", "dynamic-conceptual"],
        artifacts: {
          full: {
            url: "https://images.example.com/rhythm-study-full.jpg",
            version: "social-post-4242-v1",
          },
          thumbnail: {
            url: "https://images.example.com/rhythm-study-thumbnail.jpg",
            version: "social-post-4242-v1",
          },
        },
      },
    ],
  };
}

function importRequest(batch, { authorization = `Bearer ${SECRET}`, url } = {}) {
  return new Request(url ?? "https://api.art.jpamorgan.com/internal/art-import", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batch),
  });
}

function dependencies(bucket, fetcher) {
  return {
    bucket: bucket.value,
    database: d1(sqlite),
    fetcher,
    secret: SECRET,
    sleep: async () => {},
  };
}

beforeEach(async () => {
  sqlite = new Database(":memory:");
  await migrate(sqlite);
});

afterEach(() => sqlite.close());

describe("authenticated artwork imports", () => {
  test("rejects missing or incorrect credentials before reading or mutating anything", async () => {
    let touched = false;
    const blockedDependencies = {
      secret: SECRET,
      bucket: {
        async head() {
          touched = true;
        },
        async put() {
          touched = true;
        },
      },
      database: {
        prepare() {
          touched = true;
        },
        async batch() {
          touched = true;
        },
      },
    };

    for (const authorization of ["", "Bearer incorrect_secret_0123456789_ABCDEFGHIJKL"]) {
      const response = await handleArtworkImportRequest(
        importRequest(validBatch(), { authorization }),
        blockedDependencies,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(touched).toBe(false);
  });

  test("classifies invalid batches and permanent upstream media failures as 422", async () => {
    const validationBucket = r2();
    const invalid = validBatch();
    invalid.artworks[0].title = "";
    const validation = await handleArtworkImportRequest(importRequest(invalid), {
      bucket: validationBucket.value,
      database: d1(sqlite),
      secret: SECRET,
    });
    expect(validation.status).toBe(422);
    expect(await validation.json()).toEqual({ error: "invalid_batch" });
    expect(validationBucket.calls).toEqual({ head: 0, put: 0 });

    const mediaBucket = r2();
    const permanentMediaFailure = await handleArtworkImportRequest(
      importRequest(validBatch()),
      dependencies(mediaBucket, async () => new Response(null, { status: 404 })),
    );
    expect(permanentMediaFailure.status).toBe(422);
    expect(await permanentMediaFailure.json()).toEqual({ error: "artifact_download_failed" });
    expect(mediaBucket.calls.put).toBe(0);
  });

  test("classifies exhausted transient upstream failures as retryable 502", async () => {
    const bucket = r2();
    let fetches = 0;
    const response = await handleArtworkImportRequest(
      importRequest(validBatch()),
      dependencies(bucket, async () => {
        fetches += 1;
        return new Response(null, { status: 503 });
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "artifact_upstream_unavailable" });
    expect(fetches).toBe(4);
    expect(bucket.calls.put).toBe(0);
  });

  test("classifies R2 and non-constraint D1 failures as retryable 503", async () => {
    const unavailableBucket = r2();
    unavailableBucket.value.head = async () => {
      throw new Error("R2 temporarily unavailable");
    };
    const storageResponse = await handleArtworkImportRequest(
      importRequest(validBatch()),
      dependencies(unavailableBucket, async () => {
        throw new Error("fetch should not be reached");
      }),
    );
    expect(storageResponse.status).toBe(503);
    expect(await storageResponse.json()).toEqual({ error: "artifact_storage_unavailable" });

    const stagedBucket = r2();
    const database = d1(sqlite);
    database.batch = async () => {
      const error = new Error("D1_ERROR: database is locked");
      error.code = "SQLITE_BUSY";
      throw error;
    };
    const databaseResponse = await handleArtworkImportRequest(importRequest(validBatch()), {
      ...dependencies(
        stagedBucket,
        async () =>
          new Response(jpegBytes(), {
            headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
          }),
      ),
      database,
    });
    expect(databaseResponse.status).toBe(503);
    expect(await databaseResponse.json()).toEqual({ error: "database_unavailable" });
    expect(stagedBucket.objects.size).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM artwork WHERE id = ?").get("dynamic-rhythm-study")
        .count,
    ).toBe(0);
  });

  test("upserts normalized provenance and relationships, stores R2 artifacts, and is idempotent", async () => {
    const bucket = r2();
    const fetchCalls = [];
    const fetcher = async (url) => {
      fetchCalls.push(url.toString());
      return new Response(jpegBytes(fetchCalls.length), {
        headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
      });
    };
    const batch = validBatch();

    const first = await handleArtworkImportRequest(
      importRequest(batch),
      dependencies(bucket, fetcher),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      artworkIds: ["dynamic-rhythm-study"],
      uploaded: 2,
      reused: 0,
    });
    expect(bucket.objects.size).toBe(2);
    expect(
      [...bucket.objects.values()].every(
        (object) =>
          object.size === 1_024 &&
          object.httpMetadata.contentType === ARTIFACT_CONTENT_TYPE &&
          /^[a-f0-9]{64}$/.test(object.customMetadata.sourceFingerprint),
      ),
    ).toBe(true);
    expect(
      sqlite
        .query("SELECT kind FROM source WHERE id LIKE 'dynamic-%' ORDER BY kind")
        .all()
        .map((row) => row.kind),
    ).toEqual(["curation", "gallery", "museum", "social"]);
    expect(
      sqlite
        .query(
          `SELECT a.id, g.slug AS gallery_slug, s.kind AS source_kind
           FROM artwork a
           JOIN gallery g ON g.id = a.gallery_id
           JOIN source s ON s.id = a.source_id
           WHERE a.id = ?
           ORDER BY a.curated_at DESC, a.id DESC`,
        )
        .get("dynamic-rhythm-study"),
    ).toEqual({
      id: "dynamic-rhythm-study",
      gallery_slug: "dynamic-social-space",
      source_kind: "social",
    });
    expect(
      sqlite
        .query(
          `SELECT c.slug FROM artwork_category ac
           JOIN category c ON c.id = ac.category_id
           WHERE ac.artwork_id = ? ORDER BY c.slug`,
        )
        .all("dynamic-rhythm-study")
        .map((row) => row.slug),
    ).toEqual(["dynamic-new-media", "dynamic-painting"]);
    expect(
      sqlite
        .query(
          `SELECT s.slug FROM artwork_style arts
           JOIN style s ON s.id = arts.style_id
           WHERE arts.artwork_id = ? ORDER BY s.slug`,
        )
        .all("dynamic-rhythm-study")
        .map((row) => row.slug),
    ).toEqual(["dynamic-abstract", "dynamic-conceptual"]);

    const second = await handleArtworkImportRequest(
      importRequest(batch),
      dependencies(bucket, fetcher),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      artworkIds: ["dynamic-rhythm-study"],
      uploaded: 0,
      reused: 2,
    });
    expect(fetchCalls).toHaveLength(2);
    expect(bucket.calls.put).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM artwork WHERE id = ?").get("dynamic-rhythm-study")
        .count,
    ).toBe(1);

    const original = sqlite
      .query("SELECT image_r2_key, thumbnail_r2_key FROM artwork WHERE id = ?")
      .get("dynamic-rhythm-study");
    const changed = structuredClone(batch);
    changed.artworks[0].title = "Rhythm Study, revised";
    changed.artworks[0].categorySlugs = ["dynamic-new-media"];
    changed.artworks[0].styleSlugs = ["dynamic-conceptual"];
    changed.artworks[0].artifacts.full.version = "social-post-4242-v2";
    changed.artworks[0].artifacts.thumbnail.version = "social-post-4242-v2";

    const update = await handleArtworkImportRequest(
      importRequest(changed),
      dependencies(bucket, fetcher),
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({
      artworkIds: ["dynamic-rhythm-study"],
      uploaded: 2,
      reused: 0,
    });
    const revised = sqlite
      .query("SELECT title, image_r2_key, thumbnail_r2_key FROM artwork WHERE id = ?")
      .get("dynamic-rhythm-study");
    expect(revised.title).toBe("Rhythm Study, revised");
    expect(revised.image_r2_key).not.toBe(original.image_r2_key);
    expect(revised.thumbnail_r2_key).not.toBe(original.thumbnail_r2_key);
    expect(bucket.objects.size).toBe(4);
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM artwork_category WHERE artwork_id = ?")
        .get("dynamic-rhythm-study").count,
    ).toBe(1);
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM artwork_style WHERE artwork_id = ?")
        .get("dynamic-rhythm-study").count,
    ).toBe(1);
  });

  test("leaves D1 untouched on partial R2 failure and safely reuses the completed object on retry", async () => {
    const bucket = r2();
    let failThumbnail = true;
    let fetches = 0;
    const fetcher = async (url) => {
      fetches += 1;
      if (failThumbnail && url.toString().includes("thumbnail")) {
        return new Response(null, { status: 404 });
      }
      return new Response(jpegBytes(fetches), {
        headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
      });
    };
    const batch = validBatch();

    const failed = await handleArtworkImportRequest(
      importRequest(batch),
      dependencies(bucket, fetcher),
    );
    expect(failed.status).toBe(422);
    expect(await failed.json()).toEqual({ error: "artifact_download_failed" });
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE id = ?").get("dynamic-social").count,
    ).toBe(0);
    expect(
      sqlite.query("SELECT count(*) AS count FROM artwork WHERE id = ?").get("dynamic-rhythm-study")
        .count,
    ).toBe(0);
    expect(bucket.objects.size).toBe(1);

    failThumbnail = false;
    const retried = await handleArtworkImportRequest(
      importRequest(batch),
      dependencies(bucket, fetcher),
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({
      artworkIds: ["dynamic-rhythm-study"],
      uploaded: 1,
      reused: 1,
    });
    expect(bucket.objects.size).toBe(2);
    expect(fetches).toBe(3);
    expect(
      sqlite.query("SELECT count(*) AS count FROM artwork WHERE id = ?").get("dynamic-rhythm-study")
        .count,
    ).toBe(1);
  });

  test("rolls back every normalized D1 write on a late conflict and reuses staged R2 on retry", async () => {
    const bucket = r2();
    let fetches = 0;
    const fetcher = async () => {
      fetches += 1;
      return new Response(jpegBytes(fetches), {
        headers: { "Content-Type": ARTIFACT_CONTENT_TYPE },
      });
    };
    const valid = validBatch();
    const conflicting = structuredClone(valid);
    conflicting.artworks[0].slug = sqlite.query("SELECT slug FROM artwork LIMIT 1").get().slug;

    const failed = await handleArtworkImportRequest(
      importRequest(conflicting),
      dependencies(bucket, fetcher),
    );
    expect(failed.status).toBe(409);
    expect(await failed.json()).toEqual({ error: "database_conflict" });
    for (const [table, id] of [
      ["source", "dynamic-social"],
      ["gallery", "dynamic-social-space"],
      ["category", "dynamic-category-painting"],
      ["style", "dynamic-style-abstract"],
      ["artwork", "dynamic-rhythm-study"],
    ]) {
      expect(
        sqlite.query(`SELECT count(*) AS count FROM ${table} WHERE id = ?`).get(id).count,
      ).toBe(0);
    }
    expect(bucket.objects.size).toBe(2);

    const retried = await handleArtworkImportRequest(
      importRequest(valid),
      dependencies(bucket, fetcher),
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({
      artworkIds: ["dynamic-rhythm-study"],
      uploaded: 0,
      reused: 2,
    });
    expect(fetches).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM artwork WHERE id = ?").get("dynamic-rhythm-study")
        .count,
    ).toBe(1);
  });

  test("enforces the exact route and the streamed JSON byte limit", async () => {
    const bucket = r2();
    let prepared = false;
    const database = {
      prepare() {
        prepared = true;
      },
      async batch() {
        prepared = true;
      },
    };
    const wrongRoute = await handleArtworkImportRequest(
      importRequest(validBatch(), {
        url: "https://api.art.jpamorgan.com/internal/art-import/",
      }),
      { bucket: bucket.value, database, secret: SECRET },
    );
    expect(wrongRoute.status).toBe(404);

    const oversized = new Request("https://api.art.jpamorgan.com/internal/art-import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: new Uint8Array(257 * 1_024),
    });
    const tooLarge = await handleArtworkImportRequest(oversized, {
      bucket: bucket.value,
      database,
      secret: SECRET,
    });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "payload_too_large" });
    expect(prepared).toBe(false);
    expect(bucket.calls).toEqual({ head: 0, put: 0 });
  });
});
