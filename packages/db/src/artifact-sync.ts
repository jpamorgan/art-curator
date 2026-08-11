import { downloadArtworkArtifact } from "./artifact-download";
import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  ARTWORK_ARTIFACT_SOURCES,
  SEED_ARTIFACT_SOURCE_VERSION,
  artworkArtifactContentDisposition,
  artworkArtifactCustomMetadata,
  artworkArtifactExpectation,
  storedArtworkArtifactMatches,
  type ArtworkArtifactDescriptor,
} from "./artifacts";

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_REQUEST_INTERVAL_MS = 500;

type ArtifactBucket = Pick<R2Bucket, "head" | "put">;
type Fetcher = typeof fetch;

export type ArtifactSyncResult = {
  total: number;
  uploaded: number;
  skipped: number;
};

export type ArtifactSyncOptions = {
  attemptTimeoutMs?: number;
  concurrency?: number;
  fetcher?: Fetcher;
  log?: (message: string) => void;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export function seedArtworkArtifactDescriptors(): ArtworkArtifactDescriptor[] {
  return ARTWORK_ARTIFACT_SOURCES.flatMap((source) => [
    {
      artworkId: source.artworkId,
      variant: "full" as const,
      upstreamUrl: source.fullUrl,
      sourceVersion: SEED_ARTIFACT_SOURCE_VERSION,
    },
    {
      artworkId: source.artworkId,
      variant: "thumbnail" as const,
      upstreamUrl: source.thumbnailUrl,
      sourceVersion: SEED_ARTIFACT_SOURCE_VERSION,
    },
  ]);
}

async function syncOne(
  bucket: ArtifactBucket,
  descriptor: ArtworkArtifactDescriptor,
  options: {
    attemptTimeoutMs?: number;
    beforeAttempt: () => Promise<void>;
    fetcher: Fetcher;
    sleep: (milliseconds: number) => Promise<void>;
  },
): Promise<"uploaded" | "skipped"> {
  const expectation = await artworkArtifactExpectation(descriptor);
  const existing = await bucket.head(expectation.key);
  if (storedArtworkArtifactMatches(existing, expectation)) return "skipped";

  const bytes = await downloadArtworkArtifact(expectation, options);
  await bucket.put(expectation.key, bytes, {
    httpMetadata: {
      contentType: ARTIFACT_CONTENT_TYPE,
      cacheControl: ARTIFACT_CACHE_CONTROL,
      contentDisposition: artworkArtifactContentDisposition(expectation),
    },
    customMetadata: artworkArtifactCustomMetadata(expectation),
  });

  const stored = await bucket.head(expectation.key);
  if (!storedArtworkArtifactMatches(stored, expectation) || stored?.size !== bytes.byteLength) {
    throw new Error(
      `${descriptor.artworkId}/${descriptor.variant} failed post-upload verification.`,
    );
  }
  return "uploaded";
}

export async function syncArtworkArtifactDescriptors(
  bucket: ArtifactBucket,
  descriptors: readonly ArtworkArtifactDescriptor[],
  options: ArtifactSyncOptions = {},
): Promise<ArtifactSyncResult> {
  const queue = [...descriptors];
  if (queue.length === 0) return { total: 0, uploaded: 0, skipped: 0 };
  const concurrency = Math.max(
    1,
    Math.min(Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY), queue.length),
  );
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const requestInterval = Math.max(
    0,
    options.requestIntervalMs ?? (options.fetcher ? 0 : DEFAULT_REQUEST_INTERVAL_MS),
  );
  let nextRequestAt = 0;
  let requestGate = Promise.resolve();
  const beforeAttempt = async () => {
    const scheduled = requestGate.then(async () => {
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait > 0) await sleep(wait);
      nextRequestAt = Date.now() + requestInterval;
    });
    requestGate = scheduled.catch(() => undefined);
    await scheduled;
  };
  const result: ArtifactSyncResult = { total: queue.length, uploaded: 0, skipped: 0 };
  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < queue.length) {
        const descriptor = queue[cursor++];
        if (!descriptor) break;
        const status = await syncOne(bucket, descriptor, {
          attemptTimeoutMs: options.attemptTimeoutMs,
          beforeAttempt,
          fetcher,
          sleep,
        });
        result[status] += 1;
        options.log?.(`${status}: ${descriptor.artworkId}/${descriptor.variant}`);
      }
    }),
  );

  if (result.uploaded + result.skipped !== result.total) {
    throw new Error("Artifact sync did not account for every requested object.");
  }
  return result;
}

export async function syncArtworkArtifacts(
  bucket: ArtifactBucket,
  options: ArtifactSyncOptions = {},
): Promise<ArtifactSyncResult> {
  const result = await syncArtworkArtifactDescriptors(
    bucket,
    seedArtworkArtifactDescriptors(),
    options,
  );
  if (result.total !== 48) {
    throw new Error("Artifact sync did not account for all 48 curated objects.");
  }
  return result;
}
