import { TaskState, type ListTasksRequest, type ListTasksResponse, type Task } from "@a2a-js/sdk";
import { RequestMalformedError } from "@a2a-js/sdk/errors";
import type { ServerCallContext, TaskStore } from "@a2a-js/sdk/server";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_TASK_BYTES = 256 * 1_024;
const TASK_TTL_MS = 24 * 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 100;

type TaskDatabase = Pick<D1Database, "prepare">;

type TaskRow = {
  task_id: string;
  task_json: string;
  status_timestamp: string;
};

type CountRow = { total: number };

function scope(context: ServerCallContext) {
  return {
    tenant: context.tenant ?? "",
    owner: context.user?.userName || "anonymous",
  };
}

function encodePageToken(task: Task): string {
  return btoa(JSON.stringify([task.status?.timestamp ?? "", task.id]));
}

function decodePageToken(value: string): [timestamp: string, taskId: string] {
  try {
    const decoded = JSON.parse(atob(value));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== "string" ||
      Number.isNaN(Date.parse(decoded[0])) ||
      typeof decoded[1] !== "string" ||
      decoded[1].length === 0 ||
      decoded[1].length > 128
    ) {
      throw new Error("invalid token");
    }
    return [decoded[0], decoded[1]];
  } catch {
    throw new RequestMalformedError("pageToken is not a valid A2A task cursor.");
  }
}

function parseTask(row: TaskRow): Task {
  const task = JSON.parse(row.task_json) as Task;
  if (!task || typeof task !== "object" || task.id !== row.task_id) {
    throw new Error(`Stored A2A task ${row.task_id} is invalid.`);
  }
  return task;
}

/**
 * A bounded, tenant/owner-scoped A2A task store for Cloudflare D1.
 * Tasks expire after 24 hours, which is long enough for follow-up turns while
 * preventing anonymous task history from accumulating indefinitely.
 */
export class D1A2ATaskStore implements TaskStore {
  constructor(
    private readonly database: TaskDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async save(task: Task, context: ServerCallContext): Promise<void> {
    if (!task.id || task.id.length > 128 || !task.contextId || task.contextId.length > 128) {
      throw new Error("A2A task identifiers must be between 1 and 128 characters.");
    }
    const taskJson = JSON.stringify(task);
    if (new TextEncoder().encode(taskJson).byteLength > MAX_TASK_BYTES) {
      throw new Error(`A2A task ${task.id} exceeds the ${MAX_TASK_BYTES}-byte storage limit.`);
    }
    const currentTime = this.now();
    const expiresAt = currentTime + TASK_TTL_MS;
    const statusTimestamp = task.status?.timestamp || new Date(currentTime).toISOString();
    const currentScope = scope(context);

    await this.database
      .prepare(
        `DELETE FROM a2a_task
         WHERE task_id IN (
           SELECT task_id FROM a2a_task WHERE expires_at <= ?1 LIMIT ?2
         )`,
      )
      .bind(currentTime, CLEANUP_BATCH_SIZE)
      .run();
    await this.database
      .prepare(
        `INSERT INTO a2a_task
           (task_id, tenant, owner, context_id, status, status_timestamp, task_json, expires_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(task_id) DO UPDATE SET
           context_id = excluded.context_id,
           status = excluded.status,
           status_timestamp = excluded.status_timestamp,
           task_json = excluded.task_json,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at
         WHERE a2a_task.tenant = excluded.tenant AND a2a_task.owner = excluded.owner`,
      )
      .bind(
        task.id,
        currentScope.tenant,
        currentScope.owner,
        task.contextId,
        task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED,
        statusTimestamp,
        taskJson,
        expiresAt,
        currentTime,
      )
      .run();
  }

  async load(taskId: string, context: ServerCallContext): Promise<Task | undefined> {
    if (!taskId || taskId.length > 128) return undefined;
    const currentScope = scope(context);
    const row = await this.database
      .prepare(
        `SELECT task_id, task_json, status_timestamp
         FROM a2a_task
         WHERE task_id = ?1 AND tenant = ?2 AND owner = ?3 AND expires_at > ?4`,
      )
      .bind(taskId, currentScope.tenant, currentScope.owner, this.now())
      .first<TaskRow>();
    return row ? parseTask(row) : undefined;
  }

  async list(params: ListTasksRequest, context: ServerCallContext): Promise<ListTasksResponse> {
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
    // Anonymous task IDs act as unguessable capability handles. There is no
    // safe caller identity with which to scope ListTasks, so never enumerate
    // one anonymous caller's requests to another.
    if (!context.user?.isAuthenticated) {
      return { tasks: [], nextPageToken: "", pageSize, totalSize: 0 };
    }
    const currentScope = scope(context);
    const conditions = ["tenant = ?", "owner = ?", "expires_at > ?"];
    const bindings: unknown[] = [currentScope.tenant, currentScope.owner, this.now()];

    if (params.contextId) {
      conditions.push("context_id = ?");
      bindings.push(params.contextId);
    }
    if (params.status !== TaskState.TASK_STATE_UNSPECIFIED) {
      conditions.push("status = ?");
      bindings.push(params.status);
    }
    if (params.statusTimestampAfter) {
      conditions.push("status_timestamp >= ?");
      bindings.push(params.statusTimestampAfter);
    }

    const where = conditions.join(" AND ");
    const count = await this.database
      .prepare(`SELECT count(*) AS total FROM a2a_task WHERE ${where}`)
      .bind(...bindings)
      .first<CountRow>();

    const pageConditions = [...conditions];
    const pageBindings = [...bindings];
    if (params.pageToken) {
      const [cursorTimestamp, cursorId] = decodePageToken(params.pageToken);
      pageConditions.push("(status_timestamp < ? OR (status_timestamp = ? AND task_id < ?))");
      pageBindings.push(cursorTimestamp, cursorTimestamp, cursorId);
    }
    pageBindings.push(pageSize + 1);
    const result = await this.database
      .prepare(
        `SELECT task_id, task_json, status_timestamp
         FROM a2a_task
         WHERE ${pageConditions.join(" AND ")}
         ORDER BY status_timestamp DESC, task_id DESC
         LIMIT ?`,
      )
      .bind(...pageBindings)
      .all<TaskRow>();
    const rows = result.results;
    const hasNextPage = rows.length > pageSize;
    const tasks = rows.slice(0, pageSize).map(parseTask);

    if (!params.includeArtifacts) {
      for (const task of tasks) task.artifacts = [];
    }
    return {
      tasks,
      nextPageToken: hasNextPage && tasks.length > 0 ? encodePageToken(tasks.at(-1)!) : "",
      pageSize,
      totalSize: Number(count?.total ?? 0),
    };
  }
}

export const A2A_TASK_TTL_MS = TASK_TTL_MS;
