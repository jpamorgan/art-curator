import { describe, expect, mock, test } from "bun:test";

process.env.VITE_SERVER_URL ??= "https://api.art.jpamorgan.com";

const { createRecommendationTracker, undoAfterHide } = await import("./recommendation-gallery");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("recommendation analytics", () => {
  test("sends opens immediately and flushes queued impressions when disposed", () => {
    const send = mock(() => {});
    const tracker = createRecommendationTracker(send, 60_000);

    tracker.queue({ recommendationToken: "opaque-impression", type: "impression" });
    expect(send).not.toHaveBeenCalled();

    tracker.queue({ recommendationToken: "opaque-open", type: "open" });
    expect(send).toHaveBeenNthCalledWith(1, [{ recommendationToken: "opaque-open", type: "open" }]);

    tracker.dispose();
    expect(send).toHaveBeenNthCalledWith(2, [
      { recommendationToken: "opaque-impression", type: "impression" },
    ]);
  });

  test("deduplicates impressions before batching", () => {
    const send = mock(() => {});
    const tracker = createRecommendationTracker(send, 60_000);
    const event = { recommendationToken: "opaque-token", type: "impression" };

    tracker.queue(event);
    tracker.queue(event);
    tracker.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([event]);
  });
});

describe("recommendation feedback ordering", () => {
  test("waits for hide to finish before sending undo", async () => {
    const hide = deferred();
    const undo = mock(async () => {});

    const result = undoAfterHide(hide.promise, undo);
    await Promise.resolve();
    expect(undo).not.toHaveBeenCalled();

    hide.resolve();
    expect(await result).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  test("does not undo a hide that failed", async () => {
    const undo = mock(async () => {});

    expect(await undoAfterHide(Promise.reject(new Error("hide failed")), undo)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });
});
