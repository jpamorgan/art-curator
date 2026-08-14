export type BoundedJsonErrorReason = "media_type" | "content_length" | "too_large" | "invalid_json";

export class BoundedJsonError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(readonly reason: BoundedJsonErrorReason) {
    super(reason);
    this.status = reason === "media_type" ? 415 : reason === "too_large" ? 413 : 400;
  }
}

export function isJsonMediaType(value: string | null): boolean {
  return (
    value !== null &&
    /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(value.trim())
  );
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    throw new BoundedJsonError("media_type");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new BoundedJsonError("content_length");
    }
    if (parsedLength > maximumBytes) throw new BoundedJsonError("too_large");
  }
  if (!request.body) throw new BoundedJsonError("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new BoundedJsonError("too_large");
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
    throw new BoundedJsonError("invalid_json");
  }
}
