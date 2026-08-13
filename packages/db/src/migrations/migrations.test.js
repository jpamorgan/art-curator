import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { seedArtworkArtifactDescriptors } from "../artifact-sync";
import { artworkArtifactExpectation } from "../artifacts";

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
const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

async function applyMigration(database, name) {
  const sql = await Bun.file(`${import.meta.dir}/${name}`).text();
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

async function freshDatabase(lastMigration = migrationFiles.at(-1)) {
  const database = new Database(":memory:");
  databases.push(database);
  for (const name of migrationFiles) {
    await applyMigration(database, name);
    if (name === lastMigration) break;
  }
  return database;
}

function scalar(database, sql) {
  return database.query(sql).get()[Object.keys(database.query(sql).get())[0]];
}

function plan(database, sql, value) {
  return database
    .query(`EXPLAIN QUERY PLAN ${sql}`)
    .all(value)
    .map(({ detail }) => detail)
    .join("\n");
}

describe("additive D1 migration history", () => {
  test("applies the complete migration history on a fresh database", async () => {
    const database = await freshDatabase();

    expect(scalar(database, "SELECT count(*) AS value FROM artwork")).toBe(24);
    expect(scalar(database, "SELECT count(*) AS value FROM gallery")).toBe(15);
    expect(scalar(database, "SELECT count(*) AS value FROM source")).toBe(15);
    expect(
      scalar(
        database,
        `SELECT count(*) AS value FROM artwork
         WHERE image_r2_key = '' OR thumbnail_r2_key = ''
            OR image_source_version = '' OR thumbnail_source_version = ''
            OR length(image_fingerprint) <> 64 OR length(thumbnail_fingerprint) <> 64
            OR image_source_url = '' OR image_attribution = ''`,
      ),
    ).toBe(0);
    expect(
      scalar(
        database,
        `SELECT count(*) AS value FROM (
           SELECT image_r2_key AS key FROM artwork
           UNION ALL
           SELECT thumbnail_r2_key AS key FROM artwork
         )`,
      ),
    ).toBe(48);
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      database
        .query("PRAGMA table_info(rate_limit)")
        .all()
        .map(({ name }) => name),
    ).toEqual(["id", "key", "count", "last_request"]);
    expect(
      database
        .query("PRAGMA table_info(art_inbox)")
        .all()
        .map(({ name }) => name),
    ).toEqual(["id", "url", "created_at"]);
    expect(
      database
        .query("PRAGMA index_list(art_inbox)")
        .all()
        .map(({ name }) => name),
    ).toContain("art_inbox_created_idx");
    expect(database.query("PRAGMA table_info(art_submission)").all()).toEqual([]);
    expect(database.query("PRAGMA table_info(submission_rate_limit)").all()).toEqual([]);
    expect(database.query("SELECT id, version FROM catalog_state").all()).toEqual([
      { id: 1, version: 1 },
    ]);
    expect(database.query("SELECT count(*) AS count FROM catalog_import_guard").get()).toEqual({
      count: 0,
    });
  });

  test("enforces the link inbox and catalog guards", async () => {
    const database = await freshDatabase();
    database
      .query("INSERT INTO art_inbox (id, url) VALUES (?, 'https://example.com/work')")
      .run("00000000-0000-4000-8000-000000000001");
    const row = database.query("SELECT created_at FROM art_inbox").get();
    expect(row.created_at).toBeNumber();

    expect(() =>
      database
        .query("INSERT INTO art_inbox (id, url) VALUES (?, 'https://example.com/work')")
        .run("00000000-0000-4000-8000-000000000002"),
    ).toThrow();
    for (const statement of [
      `INSERT INTO art_inbox (id, url) VALUES ('empty-url', '')`,
      `INSERT INTO art_inbox (id, url) VALUES ('long-url', '${"a".repeat(2_049)}')`,
      `INSERT INTO catalog_state (id, version) VALUES (2, 1)`,
      `UPDATE catalog_state SET version = 0 WHERE id = 1`,
      `INSERT INTO catalog_import_guard (id, valid) VALUES (1, 0)`,
    ]) {
      expect(() => database.exec(statement)).toThrow();
    }
  });

  test("moves unresolved legacy submissions into the link inbox", async () => {
    const database = await freshDatabase("0005_tired_reavers.sql");
    database.exec(`
      INSERT INTO art_submission (id, kind, url, canonical_url, status, created_at, reviewed_at)
      VALUES
        ('pending', 'artwork', 'https://one.example/raw', 'https://one.example/work', 'pending', 1000, null),
        ('reviewing', 'artist', 'https://two.example/raw', 'https://two.example/', 'reviewing', 2000, null),
        ('rejected', 'collection', 'https://three.example/raw', 'https://three.example/', 'rejected', 3000, 3000);
    `);

    await applyMigration(database, "0006_nappy_marvex.sql");
    await applyMigration(database, "0007_classy_ma_gnuci.sql");

    expect(
      database.query("SELECT id, url, created_at FROM art_inbox ORDER BY created_at").all(),
    ).toEqual([
      { id: "pending", url: "https://one.example/work", created_at: 1000 },
      { id: "reviewing", url: "https://two.example/", created_at: 2000 },
    ]);
    expect(database.query("PRAGMA table_info(art_submission)").all()).toEqual([]);
  });

  test("upgrades the historical seed while preserving only mapped saved works", async () => {
    const database = await freshDatabase("0001_seed_curated_artworks.sql");
    database
      .query(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run("upgrade-user", "Upgrade User", "upgrade@example.com", 1, 1);
    const insertFavorite = database.query(
      "INSERT INTO favorite (user_id, artwork_id, created_at) VALUES (?, ?, ?)",
    );
    insertFavorite.run("upgrade-user", "aic-27992", 101);
    insertFavorite.run("upgrade-user", "aic-16568", 102);
    insertFavorite.run("upgrade-user", "aic-24645", 103);
    insertFavorite.run("upgrade-user", "aic-20684", 104);

    await applyMigration(database, "0002_early_iron_fist.sql");
    await applyMigration(database, "0003_curated_artifact_seed.sql");
    await applyMigration(database, "0004_slim_zarek.sql");

    expect(
      database.query("SELECT artwork_id, created_at FROM favorite ORDER BY created_at").all(),
    ).toEqual([
      { artwork_id: "aic-grande-jatte", created_at: 101 },
      { artwork_id: "aic-water-lilies", created_at: 102 },
      { artwork_id: "met-great-wave", created_at: 103 },
    ]);
    expect(scalar(database, "SELECT count(*) AS value FROM artwork")).toBe(24);
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("pins every seeded D1 key to the current source fingerprint", async () => {
    const database = await freshDatabase();
    for (const descriptor of seedArtworkArtifactDescriptors()) {
      const expected = await artworkArtifactExpectation(descriptor);
      const row = database
        .query(
          descriptor.variant === "full"
            ? `SELECT image_r2_key AS key, image_fingerprint AS fingerprint,
                 image_source_version AS source_version
               FROM artwork WHERE id = ?`
            : `SELECT thumbnail_r2_key AS key, thumbnail_fingerprint AS fingerprint,
                 thumbnail_source_version AS source_version
               FROM artwork WHERE id = ?`,
        )
        .get(descriptor.artworkId);
      expect(row).toEqual({
        key: expected.key,
        fingerprint: expected.fingerprint,
        source_version: expected.sourceVersion,
      });
    }
  });

  test("uses the gallery and taxonomy indexes for representative browse plans", async () => {
    const database = await freshDatabase();
    const galleryPlan = plan(
      database,
      `SELECT id FROM artwork
       WHERE gallery_id = ?
       ORDER BY curated_at DESC, id DESC
       LIMIT 24`,
      "musee-dorsay",
    );
    const categoryPlan = plan(
      database,
      `SELECT artwork_id FROM artwork_category
       WHERE category_id = ?`,
      "category-painting",
    );
    const stylePlan = plan(
      database,
      `SELECT artwork_id FROM artwork_style
       WHERE style_id = ?`,
      "style-impressionism",
    );

    expect(galleryPlan).toContain("artwork_gallery_recent_idx");
    expect(categoryPlan).toContain("artwork_category_category_idx");
    expect(stylePlan).toContain("artwork_style_style_idx");
  });
});
