import { toORPCError } from "@orpc/client";

export async function loadValidatedBrowseData<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (toORPCError(error).code === "NOT_FOUND") return null;
    throw error;
  }
}

export async function loadBrowseRouteData<T>(
  loadMetadata: () => Promise<T>,
  loadArtworks: () => Promise<unknown>,
): Promise<T | null> {
  const [metadataResult, artworksResult] = await Promise.allSettled([
    loadValidatedBrowseData(loadMetadata),
    loadArtworks(),
  ]);

  if (metadataResult.status === "rejected") throw metadataResult.reason;
  if (metadataResult.value === null) return null;
  if (artworksResult.status === "rejected") throw artworksResult.reason;

  return metadataResult.value;
}
