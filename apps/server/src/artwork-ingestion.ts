import { downloadArtworkArtifact } from "@art/db/artifact-download";
import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  type ArtworkArtifactVariant,
} from "@art/db/artifacts";

import { ArtworkRequestError, type ArtworkWriteDependencies } from "./artwork-contract";
import { sha256 } from "./artwork-entities";

const MAX_THUMBNAIL_BYTES = 1_500 * 1_024;
const MAX_THUMBNAIL_DIMENSION = 1_600;
export const ARTWORK_DOWNLOAD_ATTEMPTS = 3;
export const ARTWORK_DOWNLOAD_TIMEOUT_MS = 12_000;

export function jpegDimensions(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 1 >= bytes.length) break;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (width && height) return { width, height };
      break;
    }
    offset += length;
  }
  throw new ArtworkRequestError(422, "invalid_artwork");
}

async function download(
  artworkId: string,
  variant: ArtworkArtifactVariant,
  url: string,
  dependencies: ArtworkWriteDependencies,
) {
  const sourceFingerprint = await sha256(url);
  const expectation = {
    artworkId,
    variant,
    upstreamUrl: url,
    canonicalUpstreamUrl: url,
    sourceVersion: sourceFingerprint,
    fingerprint: sourceFingerprint,
    key: "",
  };
  const bytes = await downloadArtworkArtifact(expectation, {
    fetcher: dependencies.fetcher,
    sleep: dependencies.sleep,
    maxAttempts: ARTWORK_DOWNLOAD_ATTEMPTS,
    attemptTimeoutMs: dependencies.downloadAttemptTimeoutMs ?? ARTWORK_DOWNLOAD_TIMEOUT_MS,
  });
  const contentFingerprint = await sha256(bytes);
  return {
    bytes,
    contentFingerprint,
    sourceFingerprint,
    key: `artworks/v3/${sourceFingerprint}/${contentFingerprint}/${variant}.jpg`,
    ...jpegDimensions(bytes),
    url,
    variant,
  };
}

type Artifact = Awaited<ReturnType<typeof download>>;
async function store(bucket: ArtworkWriteDependencies["bucket"], artifact: Artifact) {
  try {
    await bucket.put(artifact.key, artifact.bytes, {
      httpMetadata: {
        contentType: ARTIFACT_CONTENT_TYPE,
        cacheControl: ARTIFACT_CACHE_CONTROL,
        contentDisposition: `inline; filename="${artifact.contentFingerprint}-${artifact.variant}.jpg"`,
      },
      customMetadata: {
        contentFingerprint: artifact.contentFingerprint,
        sourceFingerprint: artifact.sourceFingerprint,
        variant: artifact.variant,
      },
    });
  } catch {
    throw new ArtworkRequestError(503, "artwork_unavailable");
  }
}

export async function ingestArtworkImages(
  artworkId: string,
  fullUrl: string,
  thumbnailUrl: string,
  dependencies: ArtworkWriteDependencies,
) {
  const [full, thumbnail] = await Promise.all([
    download(artworkId, "full", fullUrl, dependencies),
    download(artworkId, "thumbnail", thumbnailUrl, dependencies),
  ]);
  if (
    thumbnail.bytes.byteLength > MAX_THUMBNAIL_BYTES ||
    thumbnail.bytes.byteLength > Math.ceil(full.bytes.byteLength * 1.1) ||
    Math.max(thumbnail.width, thumbnail.height) > MAX_THUMBNAIL_DIMENSION ||
    thumbnail.width * thumbnail.height > full.width * full.height
  )
    throw new ArtworkRequestError(422, "invalid_artwork");
  await store(dependencies.bucket, full);
  await store(dependencies.bucket, thumbnail);
  return { full, thumbnail };
}
