import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  artworkArtifactExpectation,
  isSafeArtworkId,
  storedArtworkArtifactMatches,
  type ArtworkArtifactExpectation,
  type ArtworkArtifactVariant,
} from "@art/db/artifacts";
import { eq } from "@art/db/query";
import { artwork } from "@art/db/schema/art";

const NOT_FOUND_CACHE_CONTROL = "public, max-age=60";

type Database = ReturnType<typeof import("@art/db").createDb>;
type ArtifactBucket = Pick<R2Bucket, "get" | "head">;

export type ArtifactRequestDependencies = {
  bucket: ArtifactBucket;
  resolveExpectation: (
    artworkId: string,
    variant: ArtworkArtifactVariant,
  ) => Promise<ArtworkArtifactExpectation | null>;
};

export type ArtifactRequestParams = {
  artworkId: string;
  filename: string;
};

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": NOT_FOUND_CACHE_CONTROL },
  });
}

function variantFromFilename(filename: string): ArtworkArtifactVariant | null {
  if (filename === "full.jpg") return "full";
  if (filename === "thumbnail.jpg") return "thumbnail";
  return null;
}

function normalizedEtag(value: string): string {
  return value.trim().replace(/^W\//i, "");
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  const expected = normalizedEtag(etag);
  return ifNoneMatch
    .split(",")
    .some((candidate) => candidate.trim() === "*" || normalizedEtag(candidate) === expected);
}

function isNotModified(request: Request, object: R2Object): boolean {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    return etagMatches(ifNoneMatch, object.httpEtag);
  }

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;

  const since = Date.parse(ifModifiedSince);
  return Number.isFinite(since) && object.uploaded.getTime() <= since;
}

function artifactHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", object.httpMetadata?.contentType ?? ARTIFACT_CONTENT_TYPE);
  headers.set("Content-Length", object.size.toString());
  headers.set("Cache-Control", ARTIFACT_CACHE_CONTROL);
  headers.set("CDN-Cache-Control", ARTIFACT_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export async function resolveArtworkArtifactExpectation(
  db: Database,
  artworkId: string,
  variant: ArtworkArtifactVariant,
): Promise<ArtworkArtifactExpectation | null> {
  const keyColumn = variant === "full" ? artwork.imageR2Key : artwork.thumbnailR2Key;
  const urlColumn = variant === "full" ? artwork.upstreamImageUrl : artwork.upstreamThumbnailUrl;
  const versionColumn =
    variant === "full" ? artwork.imageSourceVersion : artwork.thumbnailSourceVersion;
  const fingerprintColumn =
    variant === "full" ? artwork.imageFingerprint : artwork.thumbnailFingerprint;
  const [row] = await db
    .select({
      key: keyColumn,
      upstreamUrl: urlColumn,
      sourceVersion: versionColumn,
      fingerprint: fingerprintColumn,
    })
    .from(artwork)
    .where(eq(artwork.id, artworkId))
    .limit(1);
  if (!row) return null;
  const expectation = await artworkArtifactExpectation({
    artworkId,
    variant,
    upstreamUrl: row.upstreamUrl,
    sourceVersion: row.sourceVersion,
  });
  return row.key === expectation.key && row.fingerprint === expectation.fingerprint
    ? expectation
    : null;
}

export async function serveArtworkArtifact(
  request: Request,
  params: ArtifactRequestParams,
  dependencies: ArtifactRequestDependencies,
): Promise<Response> {
  const variant = variantFromFilename(params.filename);
  if (!variant || !isSafeArtworkId(params.artworkId)) {
    return notFound();
  }

  const versions = new URL(request.url).searchParams.getAll("v");
  const expectation = await dependencies.resolveExpectation(params.artworkId, variant);
  if (!expectation || versions.length !== 1 || versions[0] !== expectation.fingerprint) {
    return notFound();
  }

  const metadata = await dependencies.bucket.head(expectation.key);
  if (!metadata || !storedArtworkArtifactMatches(metadata, expectation)) {
    return notFound();
  }

  const headers = artifactHeaders(metadata);
  if (isNotModified(request, metadata)) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  const object = await dependencies.bucket.get(expectation.key);
  if (!object || !storedArtworkArtifactMatches(object, expectation)) {
    return notFound();
  }

  return new Response(object.body, { status: 200, headers: artifactHeaders(object) });
}
