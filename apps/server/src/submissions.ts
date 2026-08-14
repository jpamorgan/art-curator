import { createSubmissionSchema } from "@art/api/submission-contract";

import { BoundedJsonError, readBoundedJson } from "./bounded-json";
import { authorizeInternalJob } from "./internal-job-auth";

const MAX_JSON_BYTES = 4 * 1_024;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const JSON_ERRORS = {
  media_type: "json_required",
  content_length: "invalid_content_length",
  too_large: "payload_too_large",
  invalid_json: "invalid_json",
} as const;
const INBOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InboxRow = { id: string; url: string; created_at: number };
type PublicDependencies = { database: Pick<D1Database, "prepare">; createId?: () => string };
type InternalDependencies = { database: Pick<D1Database, "prepare">; secret: string };

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authorizationError(request: Request, secret: string) {
  const result = await authorizeInternalJob(request, secret);
  if (result === "authorized") return null;
  return json(
    { error: result === "unauthorized" ? "unauthorized" : "inbox_not_configured" },
    result === "unauthorized" ? 401 : 503,
  );
}

export async function handleCreateSubmissionRequest(
  request: Request,
  dependencies: PublicDependencies,
): Promise<Response> {
  try {
    const parsed = createSubmissionSchema.safeParse(await readBoundedJson(request, MAX_JSON_BYTES));
    if (!parsed.success) return json({ error: "invalid_submission" }, 400);

    const id = dependencies.createId?.() ?? crypto.randomUUID();
    const result = await dependencies.database
      .prepare(
        `INSERT INTO art_inbox (id, url)
         VALUES (?, ?)
         ON CONFLICT(url) DO NOTHING`,
      )
      .bind(id, parsed.data.url)
      .run();
    const created = (result.meta.changes ?? 0) === 1;
    return json({ alreadySaved: !created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof BoundedJsonError) {
      return json({ error: JSON_ERRORS[error.reason] }, error.status);
    }
    console.error("Inbox create failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleListSubmissionsRequest(
  request: Request,
  dependencies: InternalDependencies,
): Promise<Response> {
  const denied = await authorizationError(request, dependencies.secret);
  if (denied) return denied;
  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIST_LIMIT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    return json({ error: "invalid_limit" }, 400);
  }
  try {
    const rows = await dependencies.database
      .prepare("SELECT id, url, created_at FROM art_inbox ORDER BY created_at, id LIMIT ?")
      .bind(limit)
      .all<InboxRow>();
    return json({
      links: rows.results.map(({ id, url, created_at }) => ({
        id,
        url,
        createdAt: new Date(created_at).toISOString(),
      })),
    });
  } catch (error) {
    console.error("Inbox list failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}

export async function handleRemoveSubmissionRequest(
  request: Request,
  id: string,
  dependencies: InternalDependencies,
): Promise<Response> {
  const denied = await authorizationError(request, dependencies.secret);
  if (denied) return denied;
  if (!INBOX_ID.test(id)) return json({ error: "inbox_link_not_found" }, 404);
  try {
    const result = await dependencies.database
      .prepare("DELETE FROM art_inbox WHERE id = ?")
      .bind(id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return json({ error: "inbox_link_not_found" }, 404);
    }
    return json({ removed: true, id });
  } catch (error) {
    console.error("Inbox remove failed", error);
    return json({ error: "inbox_unavailable" }, 503);
  }
}
