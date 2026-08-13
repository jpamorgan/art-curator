import { createSubmissionSchema } from "@art/api/submission-contract";

import { authorizeInternalJob } from "./internal-job-auth";

const MAX_JSON_BYTES = 4 * 1_024;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

type InboxDatabase = Pick<D1Database, "prepare">;

type InboxRow = {
  id: string;
  url: string;
  created_at: number;
};

type InboxDependencies = {
  database: InboxDatabase;
  secret: string;
  createId?: () => string;
};

class InboxRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 413 | 415 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
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
    throw new InboxRequestError(415, "json_required");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new InboxRequestError(400, "invalid_content_length");
    }
    if (parsedLength > MAX_JSON_BYTES) throw new InboxRequestError(413, "payload_too_large");
  }
  if (!request.body) throw new InboxRequestError(400, "invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new InboxRequestError(413, "payload_too_large");
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
    throw new InboxRequestError(400, "invalid_json");
  }
}

function inboxIdIsValid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function authorize(request: Request, secret: string): Promise<void> {
  const result = await authorizeInternalJob(request, secret);
  if (result === "not_configured") throw new InboxRequestError(503, "inbox_not_configured");
  if (result === "unauthorized") throw new InboxRequestError(401, "unauthorized");
}

function inboxJson(row: InboxRow) {
  return {
    id: row.id,
    url: row.url,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function handleCreateSubmissionRequest(
  request: Request,
  dependencies: Pick<InboxDependencies, "database" | "createId">,
): Promise<Response> {
  try {
    const parsed = createSubmissionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new InboxRequestError(400, "invalid_submission");

    const id = dependencies.createId?.() ?? crypto.randomUUID();
    const result = await dependencies.database
      .prepare(
        `INSERT INTO art_inbox (id, url)
         VALUES (?, ?)
         ON CONFLICT(url) DO NOTHING`,
      )
      .bind(id, parsed.data.url)
      .run();
    const row = await dependencies.database
      .prepare("SELECT id, url, created_at FROM art_inbox WHERE url = ?")
      .bind(parsed.data.url)
      .first<InboxRow>();
    if (!row) throw new Error("Inbox insert did not return a record.");

    const created = (result.meta.changes ?? 0) === 1;
    return json({ link: inboxJson(row), alreadySaved: !created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof InboxRequestError) return json({ error: error.code }, error.status);
    console.error("Inbox create failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleListSubmissionsRequest(
  request: Request,
  dependencies: Pick<InboxDependencies, "database" | "secret">,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_LIST_LIMIT : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      throw new InboxRequestError(400, "invalid_limit");
    }

    const rows = await dependencies.database
      .prepare("SELECT id, url, created_at FROM art_inbox ORDER BY created_at, id LIMIT ?")
      .bind(limit)
      .all<InboxRow>();
    return json({ links: rows.results.map(inboxJson) });
  } catch (error) {
    if (error instanceof InboxRequestError) return json({ error: error.code }, error.status);
    console.error("Inbox list failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleRemoveSubmissionRequest(
  request: Request,
  id: string,
  dependencies: Pick<InboxDependencies, "database" | "secret">,
): Promise<Response> {
  try {
    await authorize(request, dependencies.secret);
    if (!inboxIdIsValid(id)) throw new InboxRequestError(404, "inbox_link_not_found");
    const result = await dependencies.database
      .prepare("DELETE FROM art_inbox WHERE id = ?")
      .bind(id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new InboxRequestError(404, "inbox_link_not_found");
    }
    return json({ removed: true, id });
  } catch (error) {
    if (error instanceof InboxRequestError) return json({ error: error.code }, error.status);
    console.error("Inbox remove failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}
