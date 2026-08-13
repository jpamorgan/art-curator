import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  handleCreateSubmissionRequest,
  handleListSubmissionsRequest,
  handleRemoveSubmissionRequest,
} from "./submissions";

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

  async run() {
    const result = this.database.query(this.sql).run(...this.values);
    return { success: true, meta: { changes: result.changes } };
  }

  async first() {
    return this.database.query(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.database.query(this.sql).all(...this.values) };
  }
}

function d1(database) {
  return {
    prepare(sql) {
      return new TestPreparedStatement(database, sql);
    },
  };
}

function request(
  path,
  { method = "POST", body, authorization, contentType = "application/json", contentLength } = {},
) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("Authorization", authorization);
  if (contentType !== null) headers.set("Content-Type", contentType);
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  const init = { method, headers };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`https://api.art.jpamorgan.com${path}`, init);
}

function publicRequest(body, options) {
  return request("/submissions", { body, ...options });
}

function internalRequest(path, options = {}) {
  return request(path, { authorization: `Bearer ${SECRET}`, contentType: null, ...options });
}

async function submit(url, id) {
  return handleCreateSubmissionRequest(publicRequest({ url }), {
    database: d1(sqlite),
    createId: () => id,
  });
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

describe("public link inbox", () => {
  test("accepts only a small JSON body containing one public HTTPS URL", async () => {
    const cases = [
      publicRequest({ url: "https://example.com" }, { contentType: "text/plain" }),
      publicRequest({ url: "https://example.com" }, { contentType: "application/jsonp" }),
      publicRequest({ kind: "artwork", url: "https://example.com" }),
      publicRequest({ url: "http://example.com" }),
      publicRequest({ url: "https://localhost/work" }),
      publicRequest({ url: "https://127.0.0.1/work" }),
      publicRequest({ url: "https://example.com" }, { contentLength: "4097" }),
    ];

    const statuses = [];
    for (const candidate of cases) {
      statuses.push(
        (
          await handleCreateSubmissionRequest(candidate, {
            database: d1(sqlite),
          })
        ).status,
      );
    }
    expect(statuses).toEqual([415, 415, 400, 400, 400, 400, 413]);
    expect(sqlite.query("SELECT count(*) AS count FROM art_inbox").get().count).toBe(0);

    const validCharset = await handleCreateSubmissionRequest(
      publicRequest(
        { url: "https://example.com" },
        { contentType: "application/json; charset=UTF-8" },
      ),
      {
        database: d1(sqlite),
        createId: () => "00000000-0000-4000-8000-000000000001",
      },
    );
    expect(validCharset.status).toBe(201);
  });

  test("stores one canonical URL and treats duplicates as success", async () => {
    const first = await submit(
      "https://Example.COM./work?utm_source=x&b=2&a=1#detail",
      "00000000-0000-4000-8000-000000000001",
    );
    const duplicate = await submit(
      "https://example.com/work?a=1&b=2",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({
      link: {
        id: "00000000-0000-4000-8000-000000000001",
        url: "https://example.com/work?a=1&b=2",
      },
      alreadySaved: false,
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      link: {
        id: "00000000-0000-4000-8000-000000000001",
        url: "https://example.com/work?a=1&b=2",
      },
      alreadySaved: true,
    });
    expect(sqlite.query("SELECT url FROM art_inbox").all()).toEqual([
      { url: "https://example.com/work?a=1&b=2" },
    ]);
  });
});

describe("Codex link inbox", () => {
  test("authorizes before touching the database", async () => {
    let touched = false;
    const database = {
      prepare() {
        touched = true;
        throw new Error("must not be reached");
      },
    };

    for (const authorization of [undefined, "Bearer wrong_secret_0123456789_ABCDEFGHIJKLMNO"]) {
      const list = await handleListSubmissionsRequest(
        request("/internal/inbox", { method: "GET", authorization, contentType: null }),
        { database, secret: SECRET },
      );
      const remove = await handleRemoveSubmissionRequest(
        request("/internal/inbox/id", { method: "DELETE", authorization, contentType: null }),
        "00000000-0000-4000-8000-000000000001",
        { database, secret: SECRET },
      );
      expect(list.status).toBe(401);
      expect(remove.status).toBe(401);
    }
    expect(touched).toBe(false);
  });

  test("lists oldest links first with a bounded limit", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    await submit("https://one.example.com/", firstId);
    await submit("https://two.example.com/", secondId);
    sqlite.query("UPDATE art_inbox SET created_at = ? WHERE id = ?").run(2_000, firstId);
    sqlite.query("UPDATE art_inbox SET created_at = ? WHERE id = ?").run(1_000, secondId);

    const response = await handleListSubmissionsRequest(
      internalRequest("/internal/inbox?limit=1", { method: "GET" }),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      links: [
        {
          id: secondId,
          url: "https://two.example.com/",
          createdAt: "1970-01-01T00:00:01.000Z",
        },
      ],
    });

    for (const limit of ["0", "101", "1.5", "nope"]) {
      const invalid = await handleListSubmissionsRequest(
        internalRequest(`/internal/inbox?limit=${limit}`, { method: "GET" }),
        { database: d1(sqlite), secret: SECRET },
      );
      expect(invalid.status).toBe(400);
    }
  });

  test("removes a link without review state", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await submit("https://example.com/work", id);

    const removed = await handleRemoveSubmissionRequest(
      internalRequest(`/internal/inbox/${id}`, { method: "DELETE" }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: true, id });
    expect(sqlite.query("SELECT count(*) AS count FROM art_inbox").get().count).toBe(0);

    const missing = await handleRemoveSubmissionRequest(
      internalRequest(`/internal/inbox/${id}`, { method: "DELETE" }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(missing.status).toBe(404);
  });
});
