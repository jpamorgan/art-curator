import { toORPCError } from "@orpc/client";

export async function loadValidatedBrowseData<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (toORPCError(error).code === "NOT_FOUND") return null;
    throw error;
  }
}
