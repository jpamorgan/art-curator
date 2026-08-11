import { toORPCError } from "@orpc/client";

export function isUnauthorizedError(error: unknown) {
  return error !== null && error !== undefined && toORPCError(error).code === "UNAUTHORIZED";
}
