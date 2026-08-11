import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MINIMUM_BYTES,
  artworkArtifactMaximumBytes,
  canonicalArtifactSourceUrl,
  type ArtworkArtifactExpectation,
} from "./artifacts";

const DEFAULT_ATTEMPT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_REDIRECTS = 3;
const SYNC_USER_AGENT = "Art Curator artifact import/2.0 (https://art.jpamorgan.com)";

export type ArtifactFetcher = typeof fetch;

export type ArtifactDownloadOptions = {
  attemptTimeoutMs?: number;
  beforeAttempt?: () => Promise<void>;
  fetcher?: ArtifactFetcher;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class PermanentArtifactDownloadError extends Error {}

export class TransientArtifactDownloadError extends Error {}

class RetryableArtifactDownloadError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function cancelResponseBody(response: Response | undefined): Promise<void> {
  if (!response || response.bodyUsed) return;
  try {
    await response.body?.cancel();
  } catch {
    // An abort can lock or cancel the stream before cleanup reaches it.
  }
}

function isRedirect(response: Response): boolean {
  return [301, 302, 303, 307, 308].includes(response.status);
}

async function fetchWithSafeRedirects(
  expectation: ArtworkArtifactExpectation,
  fetcher: ArtifactFetcher,
  signal: AbortSignal,
): Promise<Response> {
  let url = expectation.canonicalUpstreamUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetcher(url, {
      headers: {
        Accept: ARTIFACT_CONTENT_TYPE,
        "User-Agent": SYNC_USER_AGENT,
      },
      redirect: "manual",
      signal,
    });
    if (!isRedirect(response)) return response;

    const location = response.headers.get("location");
    await cancelResponseBody(response);
    if (!location || redirect === MAX_REDIRECTS) {
      throw new PermanentArtifactDownloadError(
        `${expectation.artworkId}/${expectation.variant} returned an invalid redirect.`,
      );
    }
    try {
      url = canonicalArtifactSourceUrl(new URL(location, url).toString());
    } catch (error) {
      throw new PermanentArtifactDownloadError(
        `${expectation.artworkId}/${expectation.variant} redirected to an unsafe URL.`,
        { cause: error },
      );
    }
  }

  throw new PermanentArtifactDownloadError(
    `${expectation.artworkId}/${expectation.variant} exceeded the redirect limit.`,
  );
}

async function readBoundedBody(
  response: Response,
  expectation: ArtworkArtifactExpectation,
  controller: AbortController,
): Promise<ArrayBuffer> {
  const maximumBytes = artworkArtifactMaximumBytes(expectation.variant);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new PermanentArtifactDownloadError(
        `${expectation.artworkId}/${expectation.variant} exceeds its byte limit.`,
      );
    }
  }

  if (!response.body) {
    throw new PermanentArtifactDownloadError(
      `${expectation.artworkId}/${expectation.variant} returned no body.`,
    );
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        const error = new PermanentArtifactDownloadError(
          `${expectation.artworkId}/${expectation.variant} exceeds its byte limit.`,
        );
        controller.abort(error);
        try {
          await reader.cancel(error);
        } catch {
          // The abort may already have cancelled the stream.
        }
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled reader may already be detached.
    }
  }

  if (totalBytes < ARTIFACT_MINIMUM_BYTES) {
    throw new PermanentArtifactDownloadError(
      `${expectation.artworkId}/${expectation.variant} is too small to be a valid JPEG.`,
    );
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new PermanentArtifactDownloadError(
      `${expectation.artworkId}/${expectation.variant} did not download as a valid JPEG.`,
    );
  }
  return bytes.buffer;
}

async function downloadOnce(
  expectation: ArtworkArtifactExpectation,
  fetcher: ArtifactFetcher,
  attemptTimeoutMs: number,
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeoutError = new RetryableArtifactDownloadError(
    `${expectation.artworkId}/${expectation.variant} timed out after ${attemptTimeoutMs}ms.`,
  );
  let response: Response | undefined;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const operation = async () => {
    response = await fetchWithSafeRedirects(expectation, fetcher, controller.signal);
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        throw new RetryableArtifactDownloadError(
          `${expectation.artworkId}/${expectation.variant} download failed with HTTP ${response.status}.`,
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1_000
            : undefined,
        );
      }
      throw new PermanentArtifactDownloadError(
        `${expectation.artworkId}/${expectation.variant} download failed with HTTP ${response.status}.`,
      );
    }

    const responseType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (responseType !== ARTIFACT_CONTENT_TYPE) {
      throw new PermanentArtifactDownloadError(
        `${expectation.artworkId}/${expectation.variant} returned ${responseType ?? "no content type"}.`,
      );
    }
    return readBoundedBody(response, expectation, controller);
  };

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(timeoutError);
        reject(timeoutError);
      }, attemptTimeoutMs);
    });
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error) {
    await cancelResponseBody(response);
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function downloadArtworkArtifact(
  expectation: ArtworkArtifactExpectation,
  options: ArtifactDownloadOptions = {},
): Promise<ArrayBuffer> {
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const requestedTimeout = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const attemptTimeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(60_000, Math.max(1, requestedTimeout))
    : DEFAULT_ATTEMPT_TIMEOUT_MS;
  const maxAttempts = Math.min(
    4,
    Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
  );
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await options.beforeAttempt?.();
    try {
      return await downloadOnce(expectation, fetcher, attemptTimeoutMs);
    } catch (error) {
      if (error instanceof PermanentArtifactDownloadError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts - 1) break;

      const requestedDelay =
        error instanceof RetryableArtifactDownloadError && error.retryAfterMs
          ? error.retryAfterMs
          : 250 * 2 ** attempt;
      await sleep(Math.min(requestedDelay, MAX_RETRY_DELAY_MS));
    }
  }

  throw new TransientArtifactDownloadError(
    `${expectation.artworkId}/${expectation.variant} download failed after ${maxAttempts} attempts: ${lastError?.message ?? "unknown network error"}`,
    { cause: lastError },
  );
}
