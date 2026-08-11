import {
  createSubmissionSchema,
  resolveSubmissionSchema,
  submissionStatuses,
  type SubmissionKind,
  type SubmissionStatus,
} from "@art/api/submission-contract";

import { authorizeInternalJob } from "./internal-job-auth";

const MAX_JSON_BYTES = 4 * 1_024;
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 50;
const SUBMISSION_RATE_LIMIT = 5;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1_000;

type SubmissionDatabase = Pick<D1Database, "prepare">;

type SubmissionRow = {
  id: string;
  kind: SubmissionKind;
  url: string;
  status: SubmissionStatus;
  review_note: string | null;
  resolved_artwork_id: string | null;
  resolved_artwork_slug: string | null;
  created_at: number;
  updated_at: number;
  reviewed_at: number | null;
};

type SubmissionDependencies = {
  database: SubmissionDatabase;
  secret: string;
  now?: () => number;
  createId?: () => string;
};

class SubmissionRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 413 | 415 | 429 | 503,
    readonly code: string,
    readonly headers?: HeadersInit,
  ) {
    super(code);
  }
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) },
  });
}

export function isJsonMediaType(value: string | null): boolean {
  return (
    value !== null &&
    /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(value.trim())
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    throw new SubmissionRequestError(415, "json_required");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new SubmissionRequestError(400, "invalid_content_length");
    }
    if (parsedLength > MAX_JSON_BYTES) {
      throw new SubmissionRequestError(413, "payload_too_large");
    }
  }
  if (!request.body) throw new SubmissionRequestError(400, "invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new SubmissionRequestError(413, "payload_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new SubmissionRequestError(400, "invalid_json");
  }
}

function submissionIdIsValid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function rateLimitClientId(secret: string, address: string, windowStartedAt: number) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`art-submission-rate-limit\0${windowStartedAt}\0${address}`),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientAddress(request: Request): string {
  const candidate = request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  return candidate && /^[0-9a-f:.]{3,64}$/.test(candidate) ? candidate : "local-development";
}

async function enforceSubmissionRateLimit(
  request: Request,
  database: SubmissionDatabase,
  secret: string,
  now: number,
): Promise<void> {
  const windowStartedAt = Math.floor(now / SUBMISSION_RATE_WINDOW_MS) * SUBMISSION_RATE_WINDOW_MS;
  const clientHash = await rateLimitClientId(secret, clientAddress(request), windowStartedAt);
  await database
    .prepare("DELETE FROM submission_rate_limit WHERE window_started_at < ?")
    .bind(windowStartedAt - SUBMISSION_RATE_WINDOW_MS)
    .run();
  const row = await database
    .prepare(
      `INSERT INTO submission_rate_limit (client_hash, window_started_at, count)
       VALUES (?, ?, 1)
       ON CONFLICT(client_hash) DO UPDATE SET
         count = min(submission_rate_limit.count + 1, ?)
       RETURNING count, window_started_at`,
    )
    .bind(clientHash, windowStartedAt, SUBMISSION_RATE_LIMIT + 1)
    .first<{ count: number; window_started_at: number }>();
  if (!row) throw new Error("Submission rate limit did not return a record.");
  if (row.count > SUBMISSION_RATE_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((row.window_started_at + SUBMISSION_RATE_WINDOW_MS - now) / 1_000),
    );
    throw new SubmissionRequestError(429, "submission_rate_limited", {
      "Retry-After": String(retryAfter),
    });
  }
}

async function authorize(request: Request, secret: string): Promise<void> {
  const result = await authorizeInternalJob(request, secret);
  if (result === "not_configured") {
    throw new SubmissionRequestError(503, "inbox_not_configured");
  }
  if (result === "unauthorized") throw new SubmissionRequestError(401, "unauthorized");
}

function submissionJson(row: SubmissionRow) {
  const resolvedArtworkId = row.status === "accepted" ? row.resolved_artwork_id : null;
  const resolvedUrl =
    row.status === "accepted" && row.resolved_artwork_slug
      ? `https://art.jpamorgan.com/art/${row.resolved_artwork_slug}`
      : null;
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    status: row.status,
    reviewNote: row.review_note,
    resolvedArtworkId,
    resolvedUrl,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    reviewedAt: row.reviewed_at === null ? null : new Date(row.reviewed_at).toISOString(),
  };
}

async function rowById(database: SubmissionDatabase, id: string): Promise<SubmissionRow | null> {
  return database
    .prepare(
      `SELECT sub.id, sub.kind, sub.url, sub.status, sub.review_note,
         sub.resolved_artwork_id, resolved.slug AS resolved_artwork_slug,
         sub.created_at, sub.updated_at, sub.reviewed_at
       FROM art_submission sub
       LEFT JOIN artwork resolved ON resolved.id = sub.resolved_artwork_id
       WHERE sub.id = ?`,
    )
    .bind(id)
    .first<SubmissionRow>();
}

async function catalogArtworkExists(
  database: SubmissionDatabase,
  resolvedArtworkId: string,
): Promise<boolean> {
  const row = await database
    .prepare("SELECT id FROM artwork WHERE id = ? LIMIT 1")
    .bind(resolvedArtworkId)
    .first<{ id: string }>();
  return row !== null;
}

export async function handleCreateSubmissionRequest(
  request: Request,
  dependencies: Pick<SubmissionDependencies, "database" | "secret" | "now" | "createId">,
): Promise<Response> {
  try {
    if (dependencies.secret.length < 32 || dependencies.secret.length > 256) {
      throw new SubmissionRequestError(503, "inbox_not_configured");
    }
    const parsed = createSubmissionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new SubmissionRequestError(400, "invalid_submission");

    const id = dependencies.createId?.() ?? crypto.randomUUID();
    const now = dependencies.now?.() ?? Date.now();
    await enforceSubmissionRateLimit(request, dependencies.database, dependencies.secret, now);
    const result = await dependencies.database
      .prepare(
        `INSERT INTO art_submission
          (id, kind, url, canonical_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(canonical_url) DO UPDATE SET
           kind = excluded.kind, url = excluded.url, status = 'pending', review_note = NULL,
           resolved_artwork_id = NULL, reviewed_at = NULL, updated_at = excluded.updated_at
         WHERE art_submission.status = 'rejected'`,
      )
      .bind(id, parsed.data.kind, parsed.data.url, parsed.data.url, now, now)
      .run();

    const row = await dependencies.database
      .prepare(
        `SELECT sub.id, sub.kind, sub.url, sub.status, sub.review_note,
           sub.resolved_artwork_id, resolved.slug AS resolved_artwork_slug,
           sub.created_at, sub.updated_at, sub.reviewed_at
         FROM art_submission sub
         LEFT JOIN artwork resolved ON resolved.id = sub.resolved_artwork_id
         WHERE sub.canonical_url = ?`,
      )
      .bind(parsed.data.url)
      .first<SubmissionRow>();
    if (!row) throw new Error("Submission insert did not return a record.");
    const created = row.id === id;
    const reopened = !created && (result.meta.changes ?? 0) > 0;

    return json(
      {
        submission: { id: row.id, status: row.status },
        alreadyReceived: !created && !reopened,
        reopened,
      },
      created ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof SubmissionRequestError) {
      return json({ error: error.code }, error.status, error.headers);
    }
    console.error("Submission inbox create failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleGetSubmissionRequest(
  request: Request,
  id: string,
  dependencies: Pick<SubmissionDependencies, "database" | "secret">,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    if (!submissionIdIsValid(id)) {
      throw new SubmissionRequestError(404, "submission_not_found");
    }
    const row = await rowById(dependencies.database, id);
    if (!row) throw new SubmissionRequestError(404, "submission_not_found");
    return json({ submission: submissionJson(row) });
  } catch (error) {
    if (error instanceof SubmissionRequestError) {
      return json({ error: error.code }, error.status, error.headers);
    }
    console.error("Submission inbox get failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleListSubmissionsRequest(
  request: Request,
  dependencies: Pick<SubmissionDependencies, "database" | "secret">,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    if (status !== null && !submissionStatuses.some((value) => value === status)) {
      throw new SubmissionRequestError(400, "invalid_status");
    }

    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_LIST_LIMIT : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new SubmissionRequestError(400, "invalid_limit");
    }

    const statement = status
      ? dependencies.database
          .prepare(
            `SELECT sub.id, sub.kind, sub.url, sub.status, sub.review_note,
               sub.resolved_artwork_id, resolved.slug AS resolved_artwork_slug,
               sub.created_at, sub.updated_at, sub.reviewed_at
             FROM art_submission sub
             LEFT JOIN artwork resolved ON resolved.id = sub.resolved_artwork_id
             WHERE sub.status = ?
             ORDER BY sub.created_at ASC, sub.id ASC LIMIT ?`,
          )
          .bind(status, limit)
      : dependencies.database
          .prepare(
            `SELECT sub.id, sub.kind, sub.url, sub.status, sub.review_note,
               sub.resolved_artwork_id, resolved.slug AS resolved_artwork_slug,
               sub.created_at, sub.updated_at, sub.reviewed_at
             FROM art_submission sub
             LEFT JOIN artwork resolved ON resolved.id = sub.resolved_artwork_id
             ORDER BY sub.created_at ASC, sub.id ASC LIMIT ?`,
          )
          .bind(limit);
    const rows = await statement.all<SubmissionRow>();
    return json({ submissions: rows.results.map(submissionJson) });
  } catch (error) {
    if (error instanceof SubmissionRequestError) {
      return json({ error: error.code }, error.status, error.headers);
    }
    console.error("Submission inbox list failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleResolveSubmissionRequest(
  request: Request,
  id: string,
  dependencies: Pick<SubmissionDependencies, "database" | "secret" | "now">,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    if (!submissionIdIsValid(id)) {
      throw new SubmissionRequestError(404, "submission_not_found");
    }
    const parsed = resolveSubmissionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new SubmissionRequestError(400, "invalid_resolution");

    const current = await rowById(dependencies.database, id);
    if (!current) throw new SubmissionRequestError(404, "submission_not_found");
    if (
      current.status !== parsed.data.expectedStatus ||
      current.updated_at !== Date.parse(parsed.data.expectedUpdatedAt)
    ) {
      throw new SubmissionRequestError(409, "submission_conflict");
    }
    if (current.status === "accepted" || current.status === "rejected") {
      throw new SubmissionRequestError(409, "submission_terminal");
    }
    const validTransition =
      (current.status === "pending" && parsed.data.status === "reviewing") ||
      (current.status === "reviewing" &&
        (parsed.data.status === "pending" ||
          parsed.data.status === "accepted" ||
          parsed.data.status === "rejected"));
    if (!validTransition) {
      throw new SubmissionRequestError(409, "invalid_submission_transition");
    }

    const now = Math.max(dependencies.now?.() ?? Date.now(), current.updated_at + 1);
    const reviewNote =
      parsed.data.reviewNote === undefined ? current.review_note : parsed.data.reviewNote;
    let resolvedArtworkId: string | null;
    if (parsed.data.status === "accepted") {
      if (
        !parsed.data.resolvedArtworkId ||
        !(await catalogArtworkExists(dependencies.database, parsed.data.resolvedArtworkId))
      ) {
        throw new SubmissionRequestError(400, "invalid_resolution");
      }
      resolvedArtworkId = parsed.data.resolvedArtworkId;
    } else {
      if (parsed.data.resolvedArtworkId !== undefined && parsed.data.resolvedArtworkId !== null) {
        throw new SubmissionRequestError(400, "invalid_resolution");
      }
      resolvedArtworkId = null;
    }
    const reviewedAt =
      parsed.data.status === "accepted" || parsed.data.status === "rejected" ? now : null;
    const result = await dependencies.database
      .prepare(
        `UPDATE art_submission
         SET status = ?, review_note = ?, resolved_artwork_id = ?, updated_at = ?, reviewed_at = ?
         WHERE id = ? AND status = ? AND updated_at = ?`,
      )
      .bind(
        parsed.data.status,
        reviewNote,
        resolvedArtworkId,
        now,
        reviewedAt,
        id,
        parsed.data.expectedStatus,
        current.updated_at,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new SubmissionRequestError(409, "submission_conflict");
    }
    const updated = await rowById(dependencies.database, id);
    if (!updated) throw new Error("Submission disappeared during update.");
    return json({ submission: submissionJson(updated) });
  } catch (error) {
    if (error instanceof SubmissionRequestError) {
      return json({ error: error.code }, error.status, error.headers);
    }
    console.error("Submission inbox update failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}
