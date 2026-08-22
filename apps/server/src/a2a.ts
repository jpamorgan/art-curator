import {
  A2A_PROTOCOL_VERSION,
  A2A_VERSION_HEADER,
  type AgentCard,
  type Artifact,
  formatSSEEvent,
  type Message,
  type Part,
  Role,
  type Task,
  TaskState,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  type AgentExecutor,
  DefaultRequestHandler,
  type ExecutionEventBus,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  type RequestContext,
  ServerCallContext,
  type TaskStore,
  validateVersion,
} from "@a2a-js/sdk/server";
import {
  ContentTypeNotSupportedError,
  TaskNotCancelableError,
  toJsonRpcError,
  UnsupportedOperationError,
} from "@a2a-js/sdk/errors";

import { BoundedJsonError, readBoundedJson } from "./bounded-json";

export const ART_A2A_ENDPOINT = "https://api.art.jpamorgan.com/a2a";
export const ART_A2A_AGENT_CARD_URL = "https://art.jpamorgan.com/.well-known/agent-card.json";
export const ART_A2A_PROTOCOL_BINDING = "JSONRPC";
export const ART_A2A_PROTOCOL_VERSION = A2A_PROTOCOL_VERSION;
export const ART_A2A_MAX_INPUT_CHARS = 1_000;
export const ART_A2A_MAX_RESULTS = 12;

const DEFAULT_RESULT_LIMIT = 6;
const MAX_TEXT_PARTS = 8;
const MAX_REQUEST_BYTES = 64 * 1_024;
const RESULT_TEXT_LIMIT = 6_000;
const ART_ORIGIN = "https://art.jpamorgan.com";
const AGENT_CARD_LINK = `<${ART_A2A_AGENT_CARD_URL}>; rel="describedby"; type="application/a2a-agent-card+json"`;

export const ART_A2A_AGENT_CARD: AgentCard = {
  name: "Art by John Philip Morgan Catalog Agent",
  description:
    "A read-only agent for discovering physical artworks in the public Art by John Philip Morgan catalog.",
  supportedInterfaces: [
    {
      url: ART_A2A_ENDPOINT,
      protocolBinding: ART_A2A_PROTOCOL_BINDING,
      protocolVersion: ART_A2A_PROTOCOL_VERSION,
      tenant: "",
    },
  ],
  provider: {
    organization: "Art by John Philip Morgan",
    url: ART_ORIGIN,
  },
  version: "1.0.0",
  documentationUrl: `${ART_ORIGIN}/llms.txt`,
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
    extensions: [],
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [
    {
      id: "browse-art-catalog",
      name: "Browse the public art catalog",
      description:
        "Browse and summarize curated physical artworks with optional artist, gallery, style, and category slug filters.",
      tags: ["art", "catalog", "artist", "gallery", "discovery"],
      examples: [
        "Show me six recent artworks.",
        "Find 4 works by artist:alice-neel.",
        "Browse style:surrealism sorted by title.",
      ],
      inputModes: ["text/plain"],
      outputModes: ["text/plain", "application/json"],
      securityRequirements: [],
    },
  ],
  signatures: [],
};

export type ArtA2ASort = "recent" | "title" | "artist";

export type ArtA2ABrowseInput = {
  query: string;
  limit: number;
  sort: ArtA2ASort;
  category?: string;
  style?: string;
  gallery?: string;
  artist?: string;
};

export type ArtA2AArtwork = {
  title: string;
  artist: string;
  date?: string | null;
  gallery?: string | null;
  url: string;
};

export type ArtA2ADependencies = {
  browseArt(input: ArtA2ABrowseInput, signal: AbortSignal): Promise<readonly ArtA2AArtwork[]>;
  onError?(error: unknown): void;
};

export type ArtA2ARuntimeOptions = {
  taskStore?: TaskStore;
  agentCard?: AgentCard;
  allowReturnImmediately?: boolean;
  allowCancellation?: boolean;
};

export type ArtA2ARuntime = {
  agentCard: AgentCard;
  executor: ArtCatalogAgentExecutor;
  requestHandler: DefaultRequestHandler;
  taskStore: TaskStore;
  transportHandler: JsonRpcTransportHandler;
  handleRequest(request: Request): Promise<Response>;
};

type ParsedInput =
  | { ok: true; value: ArtA2ABrowseInput }
  | {
      ok: false;
      message: string;
      state: TaskState.TASK_STATE_INPUT_REQUIRED | TaskState.TASK_STATE_REJECTED;
    };

type ActiveExecution = {
  contextId: string;
  controller: AbortController;
};

function singleLine(value: unknown, limit: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function textPart(text: string, mediaType = "text/plain"): Part {
  return {
    content: { $case: "text", value: text },
    filename: "",
    mediaType,
    metadata: undefined,
  };
}

function agentMessage(text: string, taskId: string, contextId: string): Message {
  return {
    messageId: crypto.randomUUID(),
    contextId,
    taskId,
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

function taskStatus(state: TaskState, text: string | undefined, taskId: string, contextId: string) {
  return {
    state,
    message: text ? agentMessage(text, taskId, contextId) : undefined,
    timestamp: timestamp(),
  };
}

function initialTask(requestContext: RequestContext, state: TaskState, text?: string): Task {
  return {
    id: requestContext.taskId,
    contextId: requestContext.contextId,
    status: taskStatus(state, text, requestContext.taskId, requestContext.contextId),
    artifacts: requestContext.task?.artifacts ?? [],
    history: requestContext.task?.history ?? [],
    metadata: undefined,
  };
}

function parseLimit(text: string): number {
  const wordLimits = new Map([
    ["one", 1],
    ["two", 2],
    ["three", 3],
    ["four", 4],
    ["five", 5],
    ["six", 6],
    ["seven", 7],
    ["eight", 8],
    ["nine", 9],
    ["ten", 10],
    ["eleven", 11],
    ["twelve", 12],
  ]);
  const match =
    text.match(/\blimit\s*[:=]\s*(\d{1,3})\b/i) ??
    text.match(/\b(?:show|find|list|return)\s+(?:up\s+to\s+)?(\d{1,3})\b/i) ??
    text.match(/\bgive\s+me\s+(?:up\s+to\s+)?(\d{1,3})\b/i);
  if (match) return Math.min(ART_A2A_MAX_RESULTS, Math.max(1, Number(match[1])));
  const wordMatch = text.match(
    /\b(?:show(?:\s+me)?|find|list|return|give\s+me)\s+(?:up\s+to\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
  );
  return wordMatch
    ? (wordLimits.get(wordMatch[1]!.toLowerCase()) ?? DEFAULT_RESULT_LIMIT)
    : DEFAULT_RESULT_LIMIT;
}

function parseSort(text: string): ArtA2ASort {
  if (/\b(?:sort(?:ed)?\s+(?:by\s+)?artist|artist\s+order)\b/i.test(text)) return "artist";
  if (/\b(?:sort(?:ed)?\s+(?:by\s+)?title|title\s+order|alphabetical(?:ly)?)\b/i.test(text)) {
    return "title";
  }
  return "recent";
}

function parseSlugFilters(text: string): Partial<ArtA2ABrowseInput> {
  const filters: Partial<ArtA2ABrowseInput> = {};
  const matcher = /(?:^|\s)(category|style|gallery|artist)\s*[:=]\s*([a-z0-9]+(?:-[a-z0-9]+)*)\b/gi;
  for (const match of text.matchAll(matcher)) {
    const key = match[1]?.toLowerCase() as "category" | "style" | "gallery" | "artist";
    const value = match[2]?.toLowerCase();
    if (value && value.length <= 96) filters[key] = value;
  }
  return filters;
}

export function parseArtA2AInput(message: Message): ParsedInput {
  if (message.role !== Role.ROLE_USER) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_REJECTED,
      message: "Send a user-role text message to browse the art catalog.",
    };
  }

  const textParts = message.parts.filter((part) => part.content?.$case === "text");
  if (textParts.length === 0) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_INPUT_REQUIRED,
      message:
        "Please send a text request, such as “Show me six recent artworks” or “Browse style:surrealism.”",
    };
  }
  if (textParts.length > MAX_TEXT_PARTS) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_REJECTED,
      message: `Please use at most ${MAX_TEXT_PARTS} text parts in one request.`,
    };
  }
  if (textParts.some((part) => part.mediaType && part.mediaType !== "text/plain")) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_REJECTED,
      message: "Text input parts must use the advertised text/plain media type.",
    };
  }

  const query = textParts
    .map((part) => (part.content?.$case === "text" ? part.content.value : ""))
    .join(" ")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_INPUT_REQUIRED,
      message: "Please describe the art you want to browse in a text message.",
    };
  }
  if (query.length > ART_A2A_MAX_INPUT_CHARS) {
    return {
      ok: false,
      state: TaskState.TASK_STATE_REJECTED,
      message: `Please keep the request to ${ART_A2A_MAX_INPUT_CHARS} characters or fewer.`,
    };
  }

  return {
    ok: true,
    value: {
      query,
      limit: parseLimit(query),
      sort: parseSort(query),
      ...parseSlugFilters(query),
    },
  };
}

function canonicalArtworkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== ART_ORIGIN || !url.pathname.startsWith("/art/")) return undefined;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeArtwork(value: unknown): ArtA2AArtwork | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const url = canonicalArtworkUrl(record.url);
  if (!url) return undefined;
  return {
    title: singleLine(record.title, 160, "Untitled"),
    artist: singleLine(record.artist, 120, "Unknown artist"),
    date: singleLine(record.date, 60, "Date unknown"),
    gallery: singleLine(record.gallery, 160, "Gallery unknown"),
    url,
  };
}

function normalizeArtworks(value: unknown, limit: number): ArtA2AArtwork[] {
  if (!Array.isArray(value)) throw new Error("browseArt must return an array.");
  const artworks: ArtA2AArtwork[] = [];
  for (const candidate of value) {
    const artwork = normalizeArtwork(candidate);
    if (artwork) artworks.push(artwork);
    if (artworks.length >= Math.min(limit, ART_A2A_MAX_RESULTS)) break;
  }
  return artworks;
}

export function formatArtA2AResults(artworks: readonly ArtA2AArtwork[]): string {
  if (artworks.length === 0) return "No curated artworks matched that request.";

  const heading = `Found ${artworks.length} curated artwork${artworks.length === 1 ? "" : "s"}.`;
  const sections = [heading];
  let length = heading.length;
  let listed = 0;
  for (const [index, artwork] of artworks.entries()) {
    const section =
      `${index + 1}. ${artwork.title} — ${artwork.artist}\n` +
      `   ${artwork.date ?? "Date unknown"} · ${artwork.gallery ?? "Gallery unknown"}\n` +
      `   ${artwork.url}`;
    if (length + section.length + 2 > RESULT_TEXT_LIMIT) break;
    sections.push(section);
    length += section.length + 2;
    listed += 1;
  }
  if (listed < artworks.length) {
    sections.push(`Additional results omitted from the text view (${artworks.length - listed}).`);
  }
  return sections.join("\n\n");
}

function resultArtifact(
  artworks: readonly ArtA2AArtwork[],
  acceptedOutputModes: readonly string[],
): Artifact {
  const includeText =
    acceptedOutputModes.length === 0 || acceptedOutputModes.includes("text/plain");
  const includeData =
    acceptedOutputModes.length === 0 || acceptedOutputModes.includes("application/json");
  return {
    artifactId: "catalog-results",
    name: "Art catalog results",
    description: "Matching public artworks with canonical Art by John Philip Morgan URLs.",
    parts: [
      ...(includeText ? [textPart(formatArtA2AResults(artworks))] : []),
      ...(includeData
        ? [
            {
              content: { $case: "data" as const, value: { artworks } },
              filename: "catalog-results.json",
              mediaType: "application/json",
              metadata: undefined,
            },
          ]
        : []),
    ],
    metadata: undefined,
    extensions: [],
  };
}

function outputModeAccepted(requestContext: RequestContext): boolean {
  const modes = requestContext.request.configuration?.acceptedOutputModes ?? [];
  return modes.length === 0 || modes.includes("text/plain") || modes.includes("application/json");
}

export class ArtCatalogAgentExecutor implements AgentExecutor {
  private readonly active = new Map<string, ActiveExecution>();
  private readonly contextIds = new Map<string, string>();

  constructor(private readonly dependencies: ArtA2ADependencies) {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId } = requestContext;
    const controller = new AbortController();
    const execution = { contextId, controller };
    this.active.set(taskId, execution);
    this.contextIds.set(taskId, contextId);

    try {
      const parsed = parseArtA2AInput(requestContext.userMessage);
      if (!parsed.ok) {
        eventBus.publish(
          AgentEvent.task(initialTask(requestContext, parsed.state, parsed.message)),
        );
        if (parsed.state === TaskState.TASK_STATE_INPUT_REQUIRED) {
          eventBus.publish(
            AgentEvent.statusUpdate({
              taskId,
              contextId,
              status: taskStatus(parsed.state, parsed.message, taskId, contextId),
              metadata: undefined,
            }),
          );
        } else {
          this.contextIds.delete(taskId);
        }
        return;
      }
      if (!outputModeAccepted(requestContext)) {
        eventBus.publish(
          AgentEvent.task(
            initialTask(
              requestContext,
              TaskState.TASK_STATE_REJECTED,
              "This agent returns text/plain and application/json catalog results.",
            ),
          ),
        );
        this.contextIds.delete(taskId);
        return;
      }

      eventBus.publish(
        AgentEvent.task(
          initialTask(
            requestContext,
            requestContext.task ? TaskState.TASK_STATE_WORKING : TaskState.TASK_STATE_SUBMITTED,
          ),
        ),
      );
      if (!requestContext.task) {
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: taskStatus(
              TaskState.TASK_STATE_WORKING,
              "Searching the public art catalog.",
              taskId,
              contextId,
            ),
            metadata: undefined,
          }),
        );
      }

      const rawArtworks = await this.dependencies.browseArt(parsed.value, controller.signal);
      if (controller.signal.aborted) return;
      const artworks = normalizeArtworks(rawArtworks, parsed.value.limit);
      eventBus.publish(
        AgentEvent.artifactUpdate({
          taskId,
          contextId,
          artifact: resultArtifact(
            artworks,
            requestContext.request.configuration?.acceptedOutputModes ?? [],
          ),
          append: false,
          lastChunk: true,
          metadata: undefined,
        }),
      );
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: taskStatus(
            TaskState.TASK_STATE_COMPLETED,
            artworks.length === 0
              ? "No curated artworks matched that request."
              : `Found ${artworks.length} curated artwork${artworks.length === 1 ? "" : "s"}. See the catalog-results artifact.`,
            taskId,
            contextId,
          ),
          metadata: undefined,
        }),
      );
      this.contextIds.delete(taskId);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.dependencies.onError?.(error);
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: taskStatus(
            TaskState.TASK_STATE_FAILED,
            "The public art catalog could not be queried. Please try again.",
            taskId,
            contextId,
          ),
          metadata: undefined,
        }),
      );
      this.contextIds.delete(taskId);
    } finally {
      if (this.active.get(taskId) === execution) this.active.delete(taskId);
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const execution = this.active.get(taskId);
    const contextId = execution?.contextId ?? this.contextIds.get(taskId);
    if (!contextId) throw new Error(`No cancellable execution found for task ${taskId}.`);

    execution?.controller.abort();
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: taskStatus(
          TaskState.TASK_STATE_CANCELED,
          "Catalog browsing was canceled.",
          taskId,
          contextId,
        ),
        metadata: undefined,
      }),
    );
    this.contextIds.delete(taskId);
  }
}

function responseHeaders(contentType: string): Headers {
  return new Headers({
    [A2A_VERSION_HEADER]: ART_A2A_PROTOCOL_VERSION,
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    Link: AGENT_CARD_LINK,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders("application/json; charset=utf-8"),
  });
}

function boundedJsonErrorResponse(error: BoundedJsonError): Response {
  const detail =
    error.reason === "media_type"
      ? "Use Content-Type: application/json."
      : error.reason === "too_large"
        ? `The JSON request exceeds ${MAX_REQUEST_BYTES} bytes.`
        : error.reason === "content_length"
          ? "Content-Length must be a non-negative integer."
          : "The request body is not valid JSON.";
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32_600, message: detail },
    },
    error.status,
  );
}

function isAsyncIterable(
  value: unknown,
): value is AsyncGenerator<Record<string, unknown>, void, undefined> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

function hasUnsupportedInputParts(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const request = body as Record<string, unknown>;
  if (request.method !== "SendMessage" && request.method !== "SendStreamingMessage") return false;
  const params = request.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return false;
  const message = (params as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  const parts = (message as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (part) =>
      !!part &&
      typeof part === "object" &&
      !Array.isArray(part) &&
      ("raw" in part ||
        "url" in part ||
        "data" in part ||
        (typeof (part as Record<string, unknown>).mediaType === "string" &&
          (part as Record<string, unknown>).mediaType !== "text/plain")),
  );
}

function streamingResponse(
  stream: AsyncGenerator<Record<string, unknown>, void, undefined>,
): Response {
  const iterator = stream[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(formatSSEEvent(next.value)));
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return?.();
      },
    }),
    {
      headers: responseHeaders("text/event-stream"),
    },
  );
}

export async function handleArtA2ARequest(
  request: Request,
  transportHandler: JsonRpcTransportHandler,
  agentCard: AgentCard = ART_A2A_AGENT_CARD,
  allowReturnImmediately = true,
  allowCancellation = true,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    const headers = responseHeaders("application/json; charset=utf-8");
    headers.set("Allow", "POST, OPTIONS");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    const headers = responseHeaders("application/json; charset=utf-8");
    headers.set("Allow", "POST, OPTIONS");
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers,
      },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonError) return boundedJsonErrorResponse(error);
    throw error;
  }

  const requestedVersion = request.headers.get(A2A_VERSION_HEADER) ?? undefined;
  const context = new ServerCallContext({ requestedVersion });
  try {
    validateVersion(context.requestedVersion, agentCard, ART_A2A_PROTOCOL_BINDING);
  } catch (error) {
    const requestId =
      body && typeof body === "object" && !Array.isArray(body) && "id" in body
        ? ((body as Record<string, unknown>).id ?? null)
        : null;
    return jsonResponse({
      jsonrpc: "2.0",
      id: requestId,
      error: JsonRpcTransportHandler.mapToJSONRPCError(error),
    });
  }
  if (hasUnsupportedInputParts(body)) {
    return jsonResponse({
      jsonrpc: "2.0",
      id: (body as Record<string, unknown>).id ?? null,
      error: toJsonRpcError(
        new ContentTypeNotSupportedError("This agent accepts only text/plain message parts."),
      ),
    });
  }
  if (
    !allowReturnImmediately &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).method === "SendMessage"
  ) {
    const params = (body as Record<string, unknown>).params;
    const configuration =
      params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>).configuration
        : undefined;
    if (
      configuration &&
      typeof configuration === "object" &&
      !Array.isArray(configuration) &&
      ((configuration as Record<string, unknown>).returnImmediately === true ||
        (configuration as Record<string, unknown>).return_immediately === true)
    ) {
      return jsonResponse({
        jsonrpc: "2.0",
        id: (body as Record<string, unknown>).id ?? null,
        error: toJsonRpcError(
          new UnsupportedOperationError(
            "returnImmediately is not supported; use blocking SendMessage or SendStreamingMessage.",
          ),
        ),
      });
    }
  }
  if (
    !allowCancellation &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).method === "CancelTask"
  ) {
    return jsonResponse({
      jsonrpc: "2.0",
      id: (body as Record<string, unknown>).id ?? null,
      error: toJsonRpcError(
        new TaskNotCancelableError(
          "CancelTask is not supported; catalog queries are short-lived and complete within their request.",
        ),
      ),
    });
  }
  const result = await transportHandler.handle(body as Record<string, unknown>, context);
  if (
    !isAsyncIterable(result) &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).method === "ListTasks"
  ) {
    const params = (body as Record<string, unknown>).params;
    const includeArtifacts =
      params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>).includeArtifacts === true
        : false;
    if (!includeArtifacts && result.result && typeof result.result === "object") {
      const tasks = (result.result as Record<string, unknown>).tasks;
      if (Array.isArray(tasks)) {
        for (const task of tasks) {
          if (task && typeof task === "object" && !Array.isArray(task)) {
            delete (task as Record<string, unknown>).artifacts;
          }
        }
      }
    }
  }
  return isAsyncIterable(result) ? streamingResponse(result) : jsonResponse(result);
}

export function createArtA2ARuntime(
  dependencies: ArtA2ADependencies,
  options: ArtA2ARuntimeOptions = {},
): ArtA2ARuntime {
  const agentCard = options.agentCard ?? ART_A2A_AGENT_CARD;
  const taskStore = options.taskStore ?? new InMemoryTaskStore();
  const executor = new ArtCatalogAgentExecutor(dependencies);
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
  const transportHandler = new JsonRpcTransportHandler(requestHandler);
  return {
    agentCard,
    executor,
    requestHandler,
    taskStore,
    transportHandler,
    handleRequest: (request) =>
      handleArtA2ARequest(
        request,
        transportHandler,
        agentCard,
        options.allowReturnImmediately ?? true,
        options.allowCancellation ?? true,
      ),
  };
}
