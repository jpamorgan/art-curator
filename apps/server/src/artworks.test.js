import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { ARTIFACT_CONTENT_TYPE } from "@art/db/artifacts";

import { artworkDraftSchema } from "./artwork-contract";
import { derivedId } from "./artwork-entities";
import {
  ARTWORK_DOWNLOAD_ATTEMPTS,
  ARTWORK_DOWNLOAD_TIMEOUT_MS,
  jpegDimensions,
} from "./artwork-ingestion";
import { handleArtworkWriteRequest } from "./artworks";

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

function jpegBytes({ height = 1_200, marker = 0, size = 2_048, width = 1_600 } = {}) {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  bytes[19] = marker;
  bytes.set(
    [
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x03,
    ],
    20,
  );
  return bytes;
}

async function sha256Prefix(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function r2({ failPut } = {}) {
  const objects = new Map();
  let puts = 0;
  return {
    objects,
    get puts() {
      return puts;
    },
    value: {
      async put(key, value, options) {
        puts += 1;
        if (puts === failPut) throw new Error("R2 unavailable");
        objects.set(key, {
          bytes: new Uint8Array(value),
          httpMetadata: { ...options.httpMetadata },
          customMetadata: { ...options.customMetadata },
          key,
          size: value.byteLength,
        });
      },
    },
  };
}

function validDraft(overrides = {}) {
  return {
    source: "moma",
    gallery: "moma",
    sourceExternalId: "new-4242",
    title: "Quiet Rhythm",
    artist: "Avery Hart",
    dateDisplay: "2026",
    description: "Layered pigment and graphite organize a quiet repeated rhythm.",
    medium: "Pigment and graphite on linen",
    dimensions: "122 × 91 cm",
    creditLine: "Courtesy of the artist",
    sourceUrl: "https://www.moma.org/collection/works/new-4242",
    imageUrl: "https://images.example.com/quiet-rhythm-full.jpg",
    thumbnailUrl: "https://images.example.com/quiet-rhythm-thumbnail.jpg",
    imageSourceUrl: "https://www.moma.org/collection/works/new-4242",
    imageAttribution: "Image courtesy of Avery Hart.",
    alt: "Layered blue and ochre marks on linen.",
    isPublicDomain: false,
    categorySlugs: ["painting"],
    styleSlugs: ["post-impressionism"],
    ...overrides,
  };
}

function distinctDraft(suffix, overrides = {}) {
  return validDraft({
    sourceExternalId: `new-${suffix}`,
    title: `Quiet Rhythm ${suffix}`,
    sourceUrl: `https://www.moma.org/collection/works/new-${suffix}`,
    imageUrl: `https://images.example.com/quiet-rhythm-${suffix}-full.jpg`,
    thumbnailUrl: `https://images.example.com/quiet-rhythm-${suffix}-thumbnail.jpg`,
    imageSourceUrl: `https://www.moma.org/collection/works/new-${suffix}`,
    ...overrides,
  });
}

function writeRequest(
  draft,
  { authorization = `Bearer ${SECRET}`, rawBody, url = "/internal/artworks" } = {},
) {
  return new Request(`https://api.art.jpamorgan.com${url}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: rawBody ?? JSON.stringify(draft),
  });
}

function dependencies(bucket, fetcher, database = d1(sqlite), now = 1_800_000_000_000) {
  return {
    bucket: bucket.value,
    database,
    fetcher,
    now: () => now,
    secret: SECRET,
    sleep: async () => {},
  };
}

function imageFetcher({
  full = jpegBytes(),
  thumbnail = jpegBytes({ width: 800, height: 600, size: 1_024 }),
} = {}) {
  return async (input) => {
    const bytes = String(input).includes("thumbnail") ? thumbnail : full;
    return new Response(bytes, { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
  };
}

async function createArtwork(draft, bucket = r2(), options = {}) {
  const response = await handleArtworkWriteRequest(
    writeRequest(draft),
    dependencies(bucket, imageFetcher(options)),
  );
  return { response, bucket, body: await response.json() };
}

beforeEach(async () => {
  sqlite = new Database(":memory:");
  await migrate(sqlite);
});

afterEach(() => sqlite.close());

describe("single artwork writes", () => {
  test("has 21 common properties and authorizes before parsing or touching dependencies", async () => {
    expect(Object.keys(artworkDraftSchema.shape)).toHaveLength(21);
    let touched = false;
    const response = await handleArtworkWriteRequest(
      new Request("https://api.art.jpamorgan.com/internal/artworks", {
        method: "POST",
        headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
        body: "not-json",
      }),
      {
        bucket: { put: async () => (touched = true) },
        database: {
          prepare() {
            touched = true;
          },
          async batch() {
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

  test("derives dimensions and two artifact identities, then atomically removes the inbox row", async () => {
    const inboxId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    sqlite
      .query("INSERT INTO art_inbox (id, url) VALUES (?, ?)")
      .run(inboxId, "https://www.moma.org/collection/works/new-4242");
    const bucket = r2();
    const draft = validDraft({ inboxId });
    const response = await handleArtworkWriteRequest(
      writeRequest(draft),
      dependencies(bucket, imageFetcher()),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.outcome).toBe("created");
    expect(body.artwork).toMatchObject({
      slug: "quiet-rhythm",
      title: "Quiet Rhythm",
      artist: "Avery Hart",
    });
    expect(body.artwork.id).toMatch(/^moma-[a-f0-9]{16}$/);
    const maximumId = await derivedId("x".repeat(96), "maximum-length");
    expect(maximumId).toHaveLength(96);
    expect(maximumId).toMatch(/^x{79}-[a-f0-9]{16}$/);

    const row = sqlite.query("SELECT * FROM artwork WHERE id = ?").get(body.artwork.id);
    expect(row).toMatchObject({
      source_id: "moma",
      gallery_id: "moma",
      source_external_id: draft.sourceExternalId,
      title: draft.title,
      artist: draft.artist,
      date_display: draft.dateDisplay,
      description: draft.description,
      medium: draft.medium,
      dimensions: draft.dimensions,
      credit_line: draft.creditLine,
      source_url: draft.sourceUrl,
      image_url: draft.imageUrl,
      thumbnail_url: draft.thumbnailUrl,
      image_source_url: draft.imageSourceUrl,
      image_attribution: draft.imageAttribution,
      alt: draft.alt,
      is_public_domain: draft.isPublicDomain ? 1 : 0,
      image_width: 1_600,
      image_height: 1_200,
      curated_at: 1_800_000_000_000,
    });
    expect(row.image_r2_key).not.toBe(row.thumbnail_r2_key);
    expect(row.image_fingerprint).not.toBe(row.thumbnail_fingerprint);
    expect(bucket.objects.get(row.image_r2_key).customMetadata).toEqual({
      contentFingerprint: row.image_fingerprint,
      sourceFingerprint: row.image_source_version,
      variant: "full",
    });
    expect(bucket.objects.get(row.thumbnail_r2_key).customMetadata).toEqual({
      contentFingerprint: row.thumbnail_fingerprint,
      sourceFingerprint: row.thumbnail_source_version,
      variant: "thumbnail",
    });
    expect(bucket.puts).toBe(2);
    expect(sqlite.query("SELECT count(*) AS count FROM art_inbox").get().count).toBe(0);
  });

  test("separates precomputed identities that collide in their first 8 SHA-256 hex", async () => {
    const bucket = r2();
    const first = await createArtwork(
      distinctDraft("hash-a", { sourceExternalId: "legacy-collision-59924" }),
      bucket,
    );
    const second = await createArtwork(
      distinctDraft("hash-b", { sourceExternalId: "legacy-collision-69327" }),
      bucket,
    );
    expect([first.body.outcome, second.body.outcome]).toEqual(["created", "created"]);
    const ids = [first.body.artwork.id, second.body.artwork.id];
    expect(ids).toEqual(["moma-55acb7b6ac2f3e1a", "moma-55acb7b6bf28b685"]);
    expect(ids[0].slice(0, -8)).toBe(ids[1].slice(0, -8));
  });

  test("creates compact source and gallery definitions in the artwork batch and reuses exact matches", async () => {
    const source = {
      create: {
        name: "Avery Hart Studio",
        kind: "gallery",
        url: "https://avery.example.com/",
        attribution: "Avery Hart Studio catalog.",
      },
    };
    const gallery = {
      create: {
        name: "Avery Hart Studio",
        location: "New York, US",
        description: "The artist's working studio and primary catalog.",
        url: "https://avery.example.com/studio",
      },
    };
    const first = await createArtwork(distinctDraft("shared-1", { source, gallery }));
    expect(first.body.outcome).toBe("created");
    const sourceRow = sqlite.query("SELECT * FROM source WHERE url = ?").get(source.create.url);
    const galleryRow = sqlite.query("SELECT * FROM gallery WHERE url = ?").get(gallery.create.url);
    expect(sourceRow.id).toBe(`source-${await sha256Prefix(source.create.url)}`);
    expect(galleryRow.id).toBe(`gallery-${await sha256Prefix(gallery.create.url)}`);
    expect(sourceRow.id).not.toContain("avery");
    expect(galleryRow.id).not.toContain("avery");
    expect(sourceRow.terms_url).toBe(source.create.url);
    expect(galleryRow.source_id).toBe(sourceRow.id);

    const second = await createArtwork(distinctDraft("shared-2", { source, gallery }));
    expect(second.body.outcome).toBe("created");
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE url = ?").get(source.create.url)
        .count,
    ).toBe(1);
    expect(
      sqlite.query("SELECT count(*) AS count FROM gallery WHERE url = ?").get(gallery.create.url)
        .count,
    ).toBe(1);

    let fetches = 0;
    const mismatch = structuredClone(source);
    mismatch.create.attribution = "Conflicting attribution.";
    const rejected = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("shared-3", { source: mismatch, gallery })),
      dependencies(first.bucket, async () => {
        fetches += 1;
        return new Response(jpegBytes(), { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
      }),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "artwork_conflict" });
    expect(fetches).toBe(0);
    expect(
      sqlite.query("SELECT attribution FROM source WHERE id = ?").get(sourceRow.id).attribution,
    ).toBe(source.create.attribution);
  });

  test("reuses exact legacy source and gallery rows by canonical URL", async () => {
    const source = {
      create: {
        name: "Legacy URL Studio",
        kind: "gallery",
        url: "https://legacy-url.example.com/",
        attribution: "Legacy URL Studio catalog.",
      },
    };
    const gallery = {
      create: {
        name: "Legacy URL Gallery",
        location: "Berlin, Germany",
        description: "A gallery created before URL-addressed entity IDs.",
        url: "https://legacy-url.example.com/gallery",
      },
    };
    sqlite
      .query(`INSERT INTO source (id, slug, name, kind, url, attribution, terms_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        "legacy-name-derived-source",
        "legacy-name-derived-source",
        source.create.name,
        source.create.kind,
        source.create.url,
        source.create.attribution,
        source.create.url,
      );
    sqlite
      .query(`INSERT INTO gallery (id, source_id, slug, name, location, description, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        "legacy-name-derived-gallery",
        "legacy-name-derived-source",
        "legacy-name-derived-gallery",
        gallery.create.name,
        gallery.create.location,
        gallery.create.description,
        gallery.create.url,
      );

    const result = await createArtwork(distinctDraft("legacy-url", { source, gallery }));
    expect(result.body.outcome).toBe("created");
    expect(
      sqlite
        .query("SELECT source_id, gallery_id FROM artwork WHERE id = ?")
        .get(result.body.artwork.id),
    ).toEqual({
      source_id: "legacy-name-derived-source",
      gallery_id: "legacy-name-derived-gallery",
    });
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE url = ?").get(source.create.url)
        .count,
    ).toBe(1);
    expect(
      sqlite.query("SELECT count(*) AS count FROM gallery WHERE url = ?").get(gallery.create.url)
        .count,
    ).toBe(1);
  });

  test("re-resolves once and rejects when a conflicting shared entity wins after preflight", async () => {
    const source = {
      create: {
        name: "Concurrent Studio",
        kind: "gallery",
        url: "https://concurrent.example.com/",
        attribution: "Expected attribution.",
      },
    };
    const gallery = {
      create: {
        name: "Concurrent Studio",
        location: "London, UK",
        description: "A concurrently created gallery.",
        url: "https://concurrent.example.com/gallery",
      },
    };
    const bucket = r2();
    const base = d1(sqlite);
    const galleryCount = sqlite.query("SELECT count(*) AS count FROM gallery").get().count;
    let raced = false;
    const database = {
      ...base,
      async batch(statements) {
        if (!raced) {
          raced = true;
          const [identity, slug, , kind, url, , termsUrl] = statements[0].values;
          sqlite
            .query(
              `INSERT INTO source (id, slug, name, kind, url, attribution, terms_url)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              identity,
              slug,
              "Concurrent Winner Studio",
              kind,
              url,
              "Conflicting attribution.",
              termsUrl,
            );
        }
        return base.batch(statements);
      },
    };
    const response = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("shared-race", { source, gallery })),
      dependencies(bucket, imageFetcher(), database),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "artwork_conflict" });
    expect(sqlite.query("SELECT count(*) AS count FROM gallery").get().count).toBe(galleryCount);
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE url = ?").get(source.create.url)
        .count,
    ).toBe(1);
    expect(sqlite.query("SELECT name FROM source WHERE url = ?").get(source.create.url).name).toBe(
      "Concurrent Winner Studio",
    );
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM artwork WHERE source_external_id = ?")
        .get("new-shared-race").count,
    ).toBe(0);
    expect(bucket.objects.size).toBe(2);
  });

  test("re-resolves once and retries without inserts when exact shared entities win", async () => {
    const source = {
      create: {
        name: "Exact Race Studio",
        kind: "gallery",
        url: "https://exact-race.example.com/",
        attribution: "Exact Race Studio catalog.",
      },
    };
    const gallery = {
      create: {
        name: "Exact Race Gallery",
        location: "Paris, France",
        description: "An exact concurrent gallery winner.",
        url: "https://exact-race.example.com/gallery",
      },
    };
    const bucket = r2();
    const base = d1(sqlite);
    let batches = 0;
    const database = {
      ...base,
      async batch(statements) {
        batches += 1;
        if (batches === 1) {
          statements[0].execute();
          statements[1].execute();
        }
        return base.batch(statements);
      },
    };
    const draft = distinctDraft("exact-shared-race", { source, gallery });
    const response = await handleArtworkWriteRequest(
      writeRequest(draft),
      dependencies(bucket, imageFetcher(), database),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("created");
    expect(batches).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE url = ?").get(source.create.url)
        .count,
    ).toBe(1);
    expect(
      sqlite.query("SELECT count(*) AS count FROM gallery WHERE url = ?").get(gallery.create.url)
        .count,
    ).toBe(1);
  });

  test("rejects a differing same-URL gallery race and keeps only the winner", async () => {
    const source = {
      create: {
        name: "Gallery Race Source",
        kind: "gallery",
        url: "https://gallery-race.example.com/",
        attribution: "Gallery Race catalog.",
      },
    };
    const gallery = {
      create: {
        name: "Gallery Race",
        location: "Tokyo, Japan",
        description: "Expected gallery description.",
        url: "https://gallery-race.example.com/gallery",
      },
    };
    const bucket = r2();
    const base = d1(sqlite);
    let raced = false;
    const database = {
      ...base,
      async batch(statements) {
        if (!raced) {
          raced = true;
          statements[0].execute();
          const [id, slug, sourceId, , location, , url] = statements[1].values;
          sqlite
            .query(`INSERT INTO gallery (id, source_id, slug, name, location, description, url)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(
              id,
              sourceId,
              slug,
              "Concurrent Gallery Winner",
              location,
              "Concurrent differing description.",
              url,
            );
        }
        return base.batch(statements);
      },
    };
    const response = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("gallery-mismatch-race", { source, gallery })),
      dependencies(bucket, imageFetcher(), database),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "artwork_conflict" });
    expect(
      sqlite.query("SELECT count(*) AS count FROM source WHERE url = ?").get(source.create.url)
        .count,
    ).toBe(1);
    expect(
      sqlite.query("SELECT count(*) AS count FROM gallery WHERE url = ?").get(gallery.create.url)
        .count,
    ).toBe(1);
    expect(
      sqlite.query("SELECT description FROM gallery WHERE url = ?").get(gallery.create.url)
        .description,
    ).toBe("Concurrent differing description.");
    expect(
      sqlite.query("SELECT name FROM gallery WHERE url = ?").get(gallery.create.url).name,
    ).toBe("Concurrent Gallery Winner");
  });

  test("detects duplicates before inbox validation and always retains the inbox row", async () => {
    const bucket = r2();
    const created = await createArtwork(validDraft(), bucket);
    expect(created.body.outcome).toBe("created");
    const inboxId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    sqlite
      .query("INSERT INTO art_inbox (id, url) VALUES (?, ?)")
      .run(inboxId, "https://example.com/duplicate");
    let fetches = 0;
    const duplicate = await handleArtworkWriteRequest(
      writeRequest(validDraft({ inboxId, title: "Attempted replacement" })),
      dependencies(bucket, async () => {
        fetches += 1;
        return new Response(jpegBytes(), { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
      }),
    );
    expect((await duplicate.json()).outcome).toBe("duplicate");
    expect(fetches).toBe(0);
    expect(bucket.puts).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM art_inbox WHERE id = ?").get(inboxId).count,
    ).toBe(1);

    const missingInboxDuplicate = await handleArtworkWriteRequest(
      writeRequest(validDraft({ inboxId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })),
      dependencies(bucket, imageFetcher()),
    );
    expect((await missingInboxDuplicate.json()).outcome).toBe("duplicate");
  });

  test("returns an existing legacy duplicate before deriving an ID or fetching images", async () => {
    let fetches = 0;
    const response = await handleArtworkWriteRequest(
      writeRequest(validDraft({ sourceExternalId: "472.1941" })),
      dependencies(r2(), async () => {
        fetches += 1;
        return new Response(jpegBytes(), { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
      }),
    );
    expect(await response.json()).toEqual({
      outcome: "duplicate",
      artwork: {
        id: "moma-starry-night",
        slug: "the-starry-night",
        title: "The Starry Night",
        artist: "Vincent van Gogh",
      },
    });
    expect(fetches).toBe(0);
  });

  test("treats artworkId as update-only and preserves curatedAt on update", async () => {
    const bucket = r2();
    let fetches = 0;
    const unknown = await handleArtworkWriteRequest(
      writeRequest(validDraft({ artworkId: "missing-artwork" })),
      dependencies(bucket, async () => {
        fetches += 1;
        return new Response(jpegBytes(), { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
      }),
    );
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });
    expect(fetches).toBe(0);

    const artworkId = "moma-starry-night";
    const original = sqlite
      .query("SELECT curated_at, updated_at, slug FROM artwork WHERE id = ?")
      .get(artworkId);
    const update = await handleArtworkWriteRequest(
      writeRequest(
        validDraft({
          artworkId,
          sourceExternalId: "472.1941",
          title: "Quiet Rhythm, revised",
          imageUrl: "https://images.example.com/revised-full.jpg",
          thumbnailUrl: "https://images.example.com/revised-thumbnail.jpg",
        }),
      ),
      dependencies(bucket, imageFetcher(), d1(sqlite), 1_900_000_000_000),
    );
    expect(await update.json()).toMatchObject({
      outcome: "updated",
      artwork: { id: artworkId, slug: original.slug },
    });
    expect(
      sqlite.query("SELECT curated_at, updated_at, slug FROM artwork WHERE id = ?").get(artworkId),
    ).toEqual({
      curated_at: original.curated_at,
      updated_at: 1_900_000_000_000,
      slug: original.slug,
    });
  });

  test("allows a shared sourceUrl but rejects authoritative update collisions before image work", async () => {
    const bucket = r2();
    const first = await createArtwork(distinctDraft("identity-a"), bucket);
    const second = await createArtwork(distinctDraft("identity-b"), bucket);
    let fetches = 0;
    const fetcher = async () => {
      fetches += 1;
      return new Response(jpegBytes(), { headers: { "Content-Type": ARTIFACT_CONTENT_TYPE } });
    };
    const sameUrl = await handleArtworkWriteRequest(
      writeRequest(
        distinctDraft("identity-c", { sourceUrl: distinctDraft("identity-b").sourceUrl }),
      ),
      dependencies(bucket, fetcher),
    );
    expect(sameUrl.status).toBe(200);
    expect((await sameUrl.json()).outcome).toBe("created");

    const collision = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("identity-b", { artworkId: first.body.artwork.id })),
      dependencies(bucket, fetcher),
    );
    expect(collision.status).toBe(409);
    expect(await collision.json()).toEqual({ error: "artwork_conflict" });
    expect(second.body.outcome).toBe("created");
    expect(fetches).toBe(2);
  });

  test("rejects malformed or oversized thumbnails without R2, D1, or inbox mutation", async () => {
    const inboxId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    sqlite
      .query("INSERT INTO art_inbox (id, url) VALUES (?, ?)")
      .run(inboxId, "https://example.com/thumbnail");
    for (const thumbnail of [
      jpegBytes({ width: 1_601, height: 600, size: 1_024 }),
      jpegBytes({ width: 800, height: 600, size: 3_000 }),
      jpegBytes({ width: 800, height: 600, size: 1_501 * 1_024 }),
    ]) {
      const bucket = r2();
      const response = await handleArtworkWriteRequest(
        writeRequest(validDraft({ inboxId })),
        dependencies(bucket, imageFetcher({ thumbnail })),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_artwork" });
      expect(bucket.puts).toBe(0);
      expect(
        sqlite.query("SELECT count(*) AS count FROM art_inbox WHERE id = ?").get(inboxId).count,
      ).toBe(1);
    }
  });

  test("keeps deterministic artifact orphans safe across storage and D1 retries", async () => {
    const inboxId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    sqlite
      .query("INSERT INTO art_inbox (id, url) VALUES (?, ?)")
      .run(inboxId, "https://example.com/retry");
    const storageBucket = r2({ failPut: 2 });
    const storageFailure = await handleArtworkWriteRequest(
      writeRequest(validDraft({ inboxId })),
      dependencies(storageBucket, imageFetcher()),
    );
    expect(await storageFailure.json()).toEqual({ error: "artwork_unavailable" });
    expect(storageBucket.objects.size).toBe(1);
    expect(
      sqlite.query("SELECT count(*) AS count FROM art_inbox WHERE id = ?").get(inboxId).count,
    ).toBe(1);

    const retried = await handleArtworkWriteRequest(
      writeRequest(validDraft({ inboxId })),
      dependencies(storageBucket, imageFetcher()),
    );
    expect((await retried.json()).outcome).toBe("created");
    expect(storageBucket.objects.size).toBe(2);
    expect(
      sqlite.query("SELECT count(*) AS count FROM art_inbox WHERE id = ?").get(inboxId).count,
    ).toBe(0);

    const d1Bucket = r2();
    const base = d1(sqlite);
    const failed = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("d1-failure")),
      dependencies(d1Bucket, imageFetcher(), {
        ...base,
        async batch() {
          throw new Error("D1 unavailable");
        },
      }),
    );
    expect(await failed.json()).toEqual({ error: "artwork_unavailable" });
    expect(d1Bucket.objects.size).toBe(2);
    const d1Retry = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("d1-failure")),
      dependencies(d1Bucket, imageFetcher()),
    );
    expect((await d1Retry.json()).outcome).toBe("created");
    expect(d1Bucket.objects.size).toBe(2);
  });

  test("bounds cyclic database error causes", async () => {
    const bucket = r2();
    const base = d1(sqlite);
    const cyclic = new Error("D1 unavailable");
    let causeReads = 0;
    Object.defineProperty(cyclic, "cause", {
      get() {
        causeReads += 1;
        return cyclic;
      },
    });
    const response = await handleArtworkWriteRequest(
      writeRequest(distinctDraft("cyclic-error")),
      dependencies(bucket, imageFetcher(), {
        ...base,
        async batch() {
          throw cyclic;
        },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "artwork_unavailable" });
    expect(causeReads).toBe(1);
  });

  test("converges to duplicate when another create wins after preflight", async () => {
    const bucket = r2();
    const base = d1(sqlite);
    const draft = distinctDraft("concurrent");
    let winner;
    let raced = false;
    const racingDatabase = {
      ...base,
      async batch(statements) {
        if (!raced) {
          raced = true;
          winner = await handleArtworkWriteRequest(
            writeRequest(draft),
            dependencies(bucket, imageFetcher(), base),
          );
        }
        return base.batch(statements);
      },
    };
    const loser = await handleArtworkWriteRequest(
      writeRequest(draft),
      dependencies(bucket, imageFetcher(), racingDatabase),
    );
    expect((await winner.json()).outcome).toBe("created");
    expect((await loser.json()).outcome).toBe("duplicate");
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM artwork WHERE source_external_id = ?")
        .get(draft.sourceExternalId).count,
    ).toBe(1);
    expect(bucket.objects.size).toBe(2);
  });

  test("recomputes a deterministic suffix when a distinct same-title create wins", async () => {
    const bucket = r2();
    const base = d1(sqlite);
    const firstDraft = distinctDraft("same-title-a", { title: "Shared Concurrent Title" });
    const secondDraft = distinctDraft("same-title-b", { title: "Shared Concurrent Title" });
    let winner;
    let raced = false;
    const racingDatabase = {
      ...base,
      async batch(statements) {
        if (!raced) {
          raced = true;
          winner = await handleArtworkWriteRequest(
            writeRequest(secondDraft),
            dependencies(bucket, imageFetcher(), base),
          );
        }
        return base.batch(statements);
      },
    };
    const retried = await handleArtworkWriteRequest(
      writeRequest(firstDraft),
      dependencies(bucket, imageFetcher(), racingDatabase),
    );
    const winnerBody = await winner.json();
    const retriedBody = await retried.json();
    expect(winnerBody.outcome).toBe("created");
    expect(retriedBody.outcome).toBe("created");
    expect(winnerBody.artwork.slug).toBe("shared-concurrent-title");
    expect(retriedBody.artwork.slug).toMatch(/^shared-concurrent-title-[a-f0-9]{16}$/);
    expect(retriedBody.artwork.slug).not.toBe(winnerBody.artwork.slug);
    expect(
      sqlite
        .query("SELECT count(*) AS count FROM artwork WHERE title = ?")
        .get("Shared Concurrent Title").count,
    ).toBe(2);
    expect(bucket.objects.size).toBe(4);
  });

  test("downloads both images in parallel and exhausts three bounded timeout attempts", async () => {
    const bucket = r2();
    let active = 0;
    let maximumActive = 0;
    let fetches = 0;
    const fetcher = (_input, init) =>
      new Promise((_resolve, reject) => {
        fetches += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        init.signal.addEventListener(
          "abort",
          () => {
            active -= 1;
            reject(init.signal.reason ?? new Error("timed out"));
          },
          { once: true },
        );
      });
    const deps = dependencies(bucket, fetcher);
    deps.downloadAttemptTimeoutMs = 1;
    const response = await handleArtworkWriteRequest(writeRequest(distinctDraft("timeout")), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "artifact_upstream_unavailable" });
    expect(ARTWORK_DOWNLOAD_ATTEMPTS).toBe(3);
    expect(ARTWORK_DOWNLOAD_TIMEOUT_MS).toBe(12_000);
    expect(fetches).toBe(6);
    expect(maximumActive).toBe(2);
    expect(bucket.puts).toBe(0);
  });

  test("keeps request and JPEG parsing bounded", async () => {
    expect(jpegDimensions(jpegBytes({ width: 321, height: 654 }))).toEqual({
      width: 321,
      height: 654,
    });
    expect(() => jpegDimensions(new Uint8Array(1_024).buffer)).toThrow();
    const bucket = r2();
    const wrongRoute = await handleArtworkWriteRequest(
      writeRequest(validDraft(), { url: "/internal/artworks/" }),
      dependencies(bucket, imageFetcher()),
    );
    expect(wrongRoute.status).toBe(404);
    const oversized = await handleArtworkWriteRequest(
      writeRequest(validDraft(), { rawBody: new Uint8Array(65 * 1_024) }),
      dependencies(bucket, imageFetcher()),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "payload_too_large" });
    expect(bucket.puts).toBe(0);
  });
});
