export type InternalJobAuthorization = "authorized" | "not_configured" | "unauthorized";

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0 && left.length === right.length;
}

export async function authorizeInternalJob(
  request: Request,
  secret: string,
): Promise<InternalJobAuthorization> {
  if (secret.length < 32 || secret.length > 256) return "not_configured";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1] || !(await secureEqual(match[1], secret))) return "unauthorized";
  return "authorized";
}
