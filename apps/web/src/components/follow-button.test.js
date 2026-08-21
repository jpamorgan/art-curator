import { afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

process.env.VITE_SERVER_URL ??= "https://api.art.jpamorgan.com";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.defineProperties(globalThis, {
  document: { configurable: true, value: dom.window.document },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  navigator: { configurable: true, value: dom.window.navigator },
  window: { configurable: true, value: dom.window },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useSyncedFollowState } = await import("./follow-button");

afterEach(cleanup);

describe("FollowButton state", () => {
  test("resets optimistic state when the entity or authoritative value changes", () => {
    const view = renderHook(
      ({ entityId, isFollowing }) => useSyncedFollowState(entityId, isFollowing),
      { initialProps: { entityId: "artist-one", isFollowing: false } },
    );

    act(() => view.result.current[1](true));
    expect(view.result.current[0]).toBe(true);

    view.rerender({ entityId: "artist-two", isFollowing: false });
    expect(view.result.current[0]).toBe(false);

    view.rerender({ entityId: "artist-two", isFollowing: true });
    expect(view.result.current[0]).toBe(true);
  });
});
