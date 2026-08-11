import { afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://art.jpamorgan.com/art/test-artwork",
});

Object.defineProperties(globalThis, {
  document: { configurable: true, value: dom.window.document },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLImageElement: { configurable: true, value: dom.window.HTMLImageElement },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  Node: { configurable: true, value: dom.window.Node },
  navigator: { configurable: true, value: dom.window.navigator },
  window: { configurable: true, value: dom.window },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperties(dom.window.HTMLImageElement.prototype, {
  complete: { configurable: true, get: () => true },
  naturalWidth: { configurable: true, get: () => 1920 },
});

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { ArtworkImage } = await import("./artwork-image");

afterEach(cleanup);

describe("ArtworkImage", () => {
  test("reveals an image that completed before hydration handlers attached", async () => {
    const { container, getByRole } = render(
      createElement(ArtworkImage, {
        artwork: {
          alt: "Test artwork",
          imageHeight: 1080,
          imageUrl: "/full.jpg",
          imageWidth: 1920,
          thumbnailUrl: "/preview.jpg",
        },
      }),
    );

    await waitFor(() => expect(container.querySelector('[data-slot="skeleton"]')).toBeNull());

    const fullImage = container.querySelector('img[src="/full.jpg"]');
    expect(getByRole("img", { name: "Test artwork" })).toBeTruthy();
    expect(fullImage?.className).toContain("opacity-100");
    expect(fullImage?.className).not.toContain("opacity-0");
  });
});
