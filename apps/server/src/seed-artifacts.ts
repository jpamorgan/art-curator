import {
  seedArtworkArtifactDescriptors,
  syncArtworkArtifactDescriptors,
  type ArtifactSyncOptions,
} from "@art/db/artifact-sync";

import { authorizeInternalJob } from "./internal-job-auth";

const SEED_SYNC_ROUTE = "/internal/artifact-sync";
const SEED_ARTIFACT_COUNT = 48;
const SEED_SYNC_CHUNK_SIZE = 6;

export type SeedArtifactSyncDependencies = {
  bucket: Pick<R2Bucket, "head" | "put">;
  secret: string;
  syncOptions?: ArtifactSyncOptions;
};

function jsonError(status: 400 | 401 | 503, error: string): Response {
  return Response.json({ error }, { status });
}

export async function handleSeedArtifactSyncRequest(
  request: Request,
  dependencies: SeedArtifactSyncDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== SEED_SYNC_ROUTE || request.method !== "POST") {
    return new Response(null, { status: 404 });
  }
  const authorization = await authorizeInternalJob(request, dependencies.secret);
  if (authorization === "not_configured") return jsonError(503, "import_not_configured");
  if (authorization === "unauthorized") return jsonError(401, "unauthorized");

  const offsets = url.searchParams.getAll("offset");
  const offset = Number(offsets[0]);
  if (
    offsets.length !== 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= SEED_ARTIFACT_COUNT ||
    offset % SEED_SYNC_CHUNK_SIZE !== 0
  ) {
    return jsonError(400, "invalid_offset");
  }

  const descriptors = seedArtworkArtifactDescriptors().slice(offset, offset + SEED_SYNC_CHUNK_SIZE);
  const result = await syncArtworkArtifactDescriptors(
    dependencies.bucket,
    descriptors,
    dependencies.syncOptions,
  );
  const nextOffset = offset + result.total;
  return Response.json({
    ...result,
    nextOffset: nextOffset < SEED_ARTIFACT_COUNT ? nextOffset : null,
  });
}
