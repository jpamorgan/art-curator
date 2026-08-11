import type { MiddlewareHandler } from "hono";

export function isTrustedMutationRequest(
  request: Request,
  trustedOrigins: ReadonlySet<string>,
): boolean {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  return origin !== null && trustedOrigins.has(origin);
}

export function mutationOriginGuard(origins: readonly string[]): MiddlewareHandler {
  const trustedOrigins = new Set(origins);

  return async (context, next) => {
    if (!isTrustedMutationRequest(context.req.raw, trustedOrigins)) {
      return context.body(null, 403);
    }

    await next();
  };
}

export const favoriteMutationGuard = mutationOriginGuard;
