import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  handleCreateSubmissionRequest,
  handleGetSubmissionRequest,
  handleListSubmissionsRequest,
  handleResolveSubmissionRequest,
} from "./submissions";

const SECRET = "art_import_test_secret_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const migrationFiles = [
  "0000_good_kabuki.sql",
  "0001_seed_curated_artworks.sql",
  "0002_early_iron_fist.sql",
  "0003_curated_artifact_seed.sql",
  "0004_slim_zarek.sql",
  "0005_tired_reavers.sql",
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
  {
    method = "POST",
    body,
    authorization,
    contentType = "application/json",
    contentLength,
    clientAddress,
  } = {},
) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("Authorization", authorization);
  if (contentType !== null) headers.set("Content-Type", contentType);
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  if (clientAddress !== undefined) headers.set("CF-Connecting-IP", clientAddress);
  const init = { method, headers };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(`https://api.art.jpamorgan.com${path}`, init);
}

function publicRequest(body, options) {
  return request("/submissions", { body, ...options });
}

function internalRequest(path, options = {}) {
  return request(path, {
    authorization: `Bearer ${SECRET}`,
    ...options,
  });
}

async function submit(body, id, { now = 1_786_469_400_000, clientAddress, secret = SECRET } = {}) {
  return handleCreateSubmissionRequest(publicRequest(body, { clientAddress }), {
    database: d1(sqlite),
    createId: () => id,
    now: () => now,
    secret,
  });
}

async function sha256(value) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function currentState(id) {
  const row = sqlite.query("SELECT status, updated_at FROM art_submission WHERE id = ?").get(id);
  return {
    expectedStatus: row.status,
    expectedUpdatedAt: new Date(row.updated_at).toISOString(),
  };
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

describe("public submission inbox", () => {
  test("validates content type, body size, strict kind, and public HTTPS URLs", async () => {
    const cases = [
      publicRequest({ kind: "artwork", url: "https://example.com" }, { contentType: "text/plain" }),
      publicRequest(
        { kind: "artwork", url: "https://example.com" },
        { contentType: "application/jsonp" },
      ),
      publicRequest(
        { kind: "artwork", url: "https://example.com" },
        { contentType: "application/json; profile=unexpected" },
      ),
      publicRequest({ kind: "design", url: "https://example.com" }),
      publicRequest({ kind: "artist", url: "http://example.com" }),
      publicRequest({ kind: "artist", url: "https://localhost/work" }),
      publicRequest({ kind: "artist", url: "https://LOCALHOST./work" }),
      publicRequest({ kind: "artist", url: "https://foo.Local./work" }),
      publicRequest({ kind: "artist", url: "https://foo.INTERNAL../work" }),
      publicRequest({ kind: "artist", url: "https://intranet./work" }),
      publicRequest({ kind: "artist", url: "https://router.home.arpa./work" }),
      publicRequest({ kind: "artist", url: "https://localhost.LocalDomain../work" }),
      publicRequest({ kind: "artist", url: "https://router。home。arpa。/work" }),
      publicRequest({ kind: "collection", url: "https://127.0.0.1/work" }),
      publicRequest({ kind: "artwork", url: "https://example.com" }, { contentLength: "4097" }),
    ];

    const statuses = [];
    for (const candidate of cases) {
      statuses.push(
        (
          await handleCreateSubmissionRequest(candidate, {
            database: d1(sqlite),
            secret: SECRET,
          })
        ).status,
      );
    }
    expect(statuses).toEqual([
      415, 415, 415, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 413,
    ]);
    expect(sqlite.query("SELECT count(*) AS count FROM art_submission").get().count).toBe(0);

    const validCharset = await handleCreateSubmissionRequest(
      publicRequest(
        { kind: "artwork", url: "https://example.com" },
        { contentType: "application/json; charset=UTF-8" },
      ),
      {
        database: d1(sqlite),
        createId: () => "00000000-0000-4000-8000-000000000001",
        secret: SECRET,
      },
    );
    expect(validCharset.status).toBe(201);
  });

  test("stores once and treats canonical duplicate URLs as a successful receipt", async () => {
    const first = await submit(
      { kind: "artwork", url: "https://Example.COM./work?utm_source=x&b=2&a=1#detail" },
      "00000000-0000-4000-8000-000000000001",
    );
    const duplicate = await submit(
      { kind: "artist", url: "https://example.com/work?a=1&b=2" },
      "00000000-0000-4000-8000-000000000002",
    );

    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({
      submission: {
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
      },
      alreadyReceived: false,
      reopened: false,
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({
      submission: {
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
      },
      alreadyReceived: true,
      reopened: false,
    });
    expect(sqlite.query("SELECT kind, url FROM art_submission").all()).toEqual([
      { kind: "artwork", url: "https://example.com/work?a=1&b=2" },
    ]);
  });

  test("reopens a rejected duplicate and clears its prior resolution", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await submit({ kind: "artwork", url: "https://example.com/work" }, id);
    sqlite
      .query(
        `UPDATE art_submission SET status = 'rejected', review_note = 'Not enough evidence',
           reviewed_at = 123`,
      )
      .run();

    const reopened = await submit(
      { kind: "artist", url: "https://example.com/work" },
      "00000000-0000-4000-8000-000000000002",
    );
    expect(reopened.status).toBe(200);
    expect(await reopened.json()).toEqual({
      submission: { id, status: "pending" },
      alreadyReceived: false,
      reopened: true,
    });
    expect(
      sqlite
        .query(
          "SELECT kind, status, review_note, resolved_artwork_id, reviewed_at FROM art_submission WHERE id = ?",
        )
        .get(id),
    ).toEqual({
      kind: "artist",
      status: "pending",
      review_note: null,
      resolved_artwork_id: null,
      reviewed_at: null,
    });
  });

  test("uses bounded rotating HMAC identities and atomically caps each client", async () => {
    const address = "203.0.113.42";
    const now = 1_786_469_400_000;
    const windowStartedAt = Math.floor(now / (60 * 60 * 1_000)) * 60 * 60 * 1_000;
    const oldHash = "a".repeat(64);
    sqlite
      .query(
        "INSERT INTO submission_rate_limit (client_hash, window_started_at, count) VALUES (?, ?, 1)",
      )
      .run(oldHash, windowStartedAt - 2 * 60 * 60 * 1_000);
    for (let index = 1; index <= 5; index += 1) {
      const response = await submit(
        { kind: "artwork", url: `https://example.com/work-${index}` },
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        { now, clientAddress: address },
      );
      expect(response.status).toBe(201);
      if (index === 1) {
        expect(
          sqlite
            .query("SELECT count(*) AS count FROM submission_rate_limit WHERE client_hash = ?")
            .get(oldHash).count,
        ).toBe(0);
      }
    }

    const limited = await submit(
      { kind: "artwork", url: "https://example.com/work-6" },
      "00000000-0000-4000-8000-000000000006",
      { now, clientAddress: address },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({ error: "submission_rate_limited" });
    const rateRow = sqlite.query("SELECT client_hash, count FROM submission_rate_limit").get();
    expect(rateRow.client_hash).toHaveLength(64);
    expect(rateRow.client_hash).not.toContain(address);
    expect(rateRow.client_hash).not.toBe(
      await sha256(`art-submission-rate-limit\0${windowStartedAt}\0${address}`),
    );
    expect(rateRow.count).toBe(6);
    expect(sqlite.query("SELECT count(*) AS count FROM art_submission").get().count).toBe(5);

    const alternateSecret = `${SECRET}_alternate`;
    const alternate = await submit(
      { kind: "artwork", url: "https://example.com/work-alternate" },
      "00000000-0000-4000-8000-000000000008",
      { now, clientAddress: address, secret: alternateSecret },
    );
    expect(alternate.status).toBe(201);
    const currentHashes = sqlite
      .query("SELECT client_hash FROM submission_rate_limit ORDER BY client_hash")
      .all()
      .map((row) => row.client_hash);
    expect(new Set(currentHashes).size).toBe(2);

    const reset = await submit(
      { kind: "artwork", url: "https://example.com/work-7" },
      "00000000-0000-4000-8000-000000000007",
      { now: now + 60 * 60 * 1_000, clientAddress: address },
    );
    expect(reset.status).toBe(201);
    const nextWindowRows = sqlite
      .query("SELECT client_hash, window_started_at, count FROM submission_rate_limit")
      .all();
    const resetRow = nextWindowRows.find((row) => row.window_started_at > windowStartedAt);
    expect(resetRow.count).toBe(1);
    expect(currentHashes).not.toContain(resetRow.client_hash);
  });
});

describe("Codex submission inbox operations", () => {
  test("authorizes before touching the database", async () => {
    let touched = false;
    const database = {
      prepare() {
        touched = true;
        throw new Error("must not be reached");
      },
    };
    for (const authorization of [undefined, "Bearer wrong_secret_0123456789_ABCDEFGHIJKLMNO"]) {
      const response = await handleListSubmissionsRequest(
        request("/internal/submissions", {
          method: "GET",
          authorization,
          contentType: null,
        }),
        { database, secret: SECRET },
      );
      expect(response.status).toBe(401);
    }
    expect(touched).toBe(false);
  });

  test("returns a bounded, filterable oldest-first queue", async () => {
    await submit(
      { kind: "artist", url: "https://one.example.com" },
      "00000000-0000-4000-8000-000000000001",
    );
    await submit(
      { kind: "collection", url: "https://two.example.com" },
      "00000000-0000-4000-8000-000000000002",
    );
    sqlite
      .query("UPDATE art_submission SET status = 'reviewing' WHERE id = ?")
      .run("00000000-0000-4000-8000-000000000002");

    const pending = await handleListSubmissionsRequest(
      internalRequest("/internal/submissions?status=pending&limit=1", {
        method: "GET",
        contentType: null,
      }),
      { database: d1(sqlite), secret: SECRET },
    );
    expect(pending.status).toBe(200);
    expect((await pending.json()).submissions).toHaveLength(1);
    expect(
      (
        await handleListSubmissionsRequest(
          internalRequest("/internal/submissions?limit=51", { method: "GET", contentType: null }),
          { database: d1(sqlite), secret: SECRET },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleListSubmissionsRequest(
          internalRequest("/internal/submissions?status=unknown", {
            method: "GET",
            contentType: null,
          }),
          { database: d1(sqlite), secret: SECRET },
        )
      ).status,
    ).toBe(400);
  });

  test("gets one submission directly without relying on a bounded list", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await submit({ kind: "artist", url: "https://example.com/artist" }, id);
    const response = await handleGetSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, { method: "GET", contentType: null }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).submission).toMatchObject({
      id,
      status: "pending",
      url: "https://example.com/artist",
    });
    expect(
      (
        await handleGetSubmissionRequest(
          internalRequest("/internal/submissions/00000000-0000-4000-8000-000000000099", {
            method: "GET",
            contentType: null,
          }),
          "00000000-0000-4000-8000-000000000099",
          { database: d1(sqlite), secret: SECRET },
        )
      ).status,
    ).toBe(404);
  });

  test("enforces the review graph, terminal states, and referential resolutions", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await submit({ kind: "artwork", url: "https://example.com/work" }, id);
    const initial = currentState(id);

    const invalidSchema = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...initial, status: "reviewing", reviewNote: "x".repeat(501) },
      }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(invalidSchema.status).toBe(400);

    const skipReview = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...initial, status: "accepted", resolvedArtworkId: "moma-starry-night" },
      }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(skipReview.status).toBe(409);
    expect(await skipReview.json()).toEqual({ error: "invalid_submission_transition" });

    const invalidReviewResolution = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...initial, status: "reviewing", resolvedArtworkId: "moma-starry-night" },
      }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect(invalidReviewResolution.status).toBe(400);

    const reviewing = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...initial, status: "reviewing" },
      }),
      id,
      {
        database: d1(sqlite),
        secret: SECRET,
        now: () => 1_786_469_500_000,
      },
    );
    expect(reviewing.status).toBe(200);
    expect((await reviewing.json()).submission).toMatchObject({
      status: "reviewing",
      resolvedArtworkId: null,
      resolvedUrl: null,
      reviewedAt: null,
    });

    for (const body of [
      { ...currentState(id), status: "accepted" },
      { ...currentState(id), status: "accepted", resolvedArtworkId: "not-in-the-catalog" },
    ]) {
      const invalid = await handleResolveSubmissionRequest(
        internalRequest(`/internal/submissions/${id}`, { method: "PATCH", body }),
        id,
        { database: d1(sqlite), secret: SECRET },
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: "invalid_resolution" });
    }

    const accepted = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: {
          ...currentState(id),
          status: "accepted",
          reviewNote: "Imported as a verified public-domain work.",
          resolvedArtworkId: "moma-starry-night",
        },
      }),
      id,
      { database: d1(sqlite), secret: SECRET, now: () => 1_786_469_600_000 },
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).submission).toMatchObject({
      id,
      status: "accepted",
      resolvedArtworkId: "moma-starry-night",
      resolvedUrl: "https://art.jpamorgan.com/art/the-starry-night",
      reviewedAt: "2026-08-11T17:33:20.000Z",
    });

    sqlite
      .query("UPDATE artwork SET slug = 'starry-night-renamed' WHERE id = 'moma-starry-night'")
      .run();
    const renamed = await handleGetSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, { method: "GET", contentType: null }),
      id,
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await renamed.json()).submission).toMatchObject({
      resolvedArtworkId: "moma-starry-night",
      resolvedUrl: "https://art.jpamorgan.com/art/starry-night-renamed",
    });

    const immutable = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...currentState(id), status: "reviewing" },
      }),
      id,
      { database: d1(sqlite), secret: SECRET, now: () => 1_786_469_700_000 },
    );
    expect(immutable.status).toBe(409);
    expect(await immutable.json()).toEqual({ error: "submission_terminal" });

    const rejectedId = "00000000-0000-4000-8000-000000000002";
    await submit({ kind: "artist", url: "https://example.com/artist-two" }, rejectedId);
    for (const status of ["reviewing", "pending", "reviewing", "rejected"]) {
      const transition = await handleResolveSubmissionRequest(
        internalRequest(`/internal/submissions/${rejectedId}`, {
          method: "PATCH",
          body: { ...currentState(rejectedId), status },
        }),
        rejectedId,
        { database: d1(sqlite), secret: SECRET },
      );
      expect(transition.status).toBe(200);
    }
    const rejected = await handleGetSubmissionRequest(
      internalRequest(`/internal/submissions/${rejectedId}`, {
        method: "GET",
        contentType: null,
      }),
      rejectedId,
      { database: d1(sqlite), secret: SECRET },
    );
    expect((await rejected.json()).submission).toMatchObject({
      status: "rejected",
      resolvedArtworkId: null,
      resolvedUrl: null,
    });
  });

  test("rejects stale optimistic updates without mutation", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await submit({ kind: "artwork", url: "https://example.com/work" }, id);
    const stale = currentState(id);
    const first = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...stale, status: "reviewing" },
      }),
      id,
      { database: d1(sqlite), secret: SECRET, now: () => 1_786_469_500_000 },
    );
    expect(first.status).toBe(200);

    const conflict = await handleResolveSubmissionRequest(
      internalRequest(`/internal/submissions/${id}`, {
        method: "PATCH",
        body: { ...stale, status: "rejected" },
      }),
      id,
      { database: d1(sqlite), secret: SECRET, now: () => 1_786_469_600_000 },
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "submission_conflict" });
    expect(sqlite.query("SELECT status FROM art_submission WHERE id = ?").get(id).status).toBe(
      "reviewing",
    );
  });
});
