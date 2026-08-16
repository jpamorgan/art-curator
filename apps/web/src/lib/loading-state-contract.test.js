import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrowseIndexSkeleton } from "../components/browse-index";
import { GalleryPageSkeleton } from "../components/gallery-skeleton";

const sourceRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);

async function readWebSource(path) {
  return Bun.file(new URL(path, sourceRoot)).text();
}

async function readRepositorySource(path) {
  return Bun.file(new URL(path, repositoryRoot)).text();
}

describe("loading-state design contract", () => {
  test("renders shared route skeletons as accessible, non-interactive SSR markup", () => {
    const skeletons = [
      createElement(GalleryPageSkeleton),
      createElement(BrowseIndexSkeleton, { kind: "galleries" }),
      createElement(BrowseIndexSkeleton, { kind: "styles" }),
    ];

    for (const skeleton of skeletons) {
      const markup = renderToStaticMarkup(skeleton);

      expect(markup).toContain('role="status"');
      expect(markup).toContain('aria-live="polite"');
      expect(markup).toContain('aria-busy="true"');
      expect(markup).toContain('class="sr-only"');
      expect(markup).not.toMatch(/<(?:a|button|img)\b/u);
    }
  });

  test("turns off decorative loading motion when reduced motion is requested", async () => {
    const appCss = await readWebSource("index.css");
    const uiCss = await readRepositorySource("packages/ui/src/styles/globals.css");

    expect(appCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.navigation-progress[\s\S]*?animation:\s*none/u,
    );
    expect(uiCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\[data-slot=["']skeleton["']\]::after[\s\S]*?animation:\s*none/u,
    );
  });

  test("keeps loading transitions narrowly scoped", async () => {
    const loadingStateFiles = [
      "components/gallery-skeleton.tsx",
      "components/artwork-image.tsx",
      "components/browse-index.tsx",
      "components/filtered-gallery-page.tsx",
      "components/favorite-button.tsx",
      "components/pending-button-label.tsx",
      "components/sign-in-form.tsx",
      "components/sign-up-form.tsx",
      "components/user-menu.tsx",
      "routes/art.$slug.tsx",
      "index.css",
    ];
    const sources = await Promise.all(loadingStateFiles.map(readWebSource));
    sources.push(
      await readRepositorySource("packages/ui/src/components/skeleton.tsx"),
      await readRepositorySource("packages/ui/src/styles/globals.css"),
    );

    expect(sources.join("\n")).not.toMatch(
      /\btransition-all\b|\btransition\s*:\s*all\b|\bwill-change\s*:\s*all\b|\bwill-change-\[all\]\b/u,
    );
  });

  test("keeps pending button labels in one stable cell and cross-fades exact icon states", async () => {
    const pendingLabelSource = await readWebSource("components/pending-button-label.tsx");

    expect(pendingLabelSource).toContain("export function PendingButtonLabel");
    expect(pendingLabelSource.match(/col-start-1 row-start-1/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(pendingLabelSource).toContain("aria-hidden");
    expect(pendingLabelSource).toContain("transition-[opacity,filter,scale]");
    expect(pendingLabelSource).toContain("scale-[0.25]");
    expect(pendingLabelSource).toContain("scale-100");
    expect(pendingLabelSource).toContain("opacity-0");
    expect(pendingLabelSource).toContain("opacity-100");
    expect(pendingLabelSource).toContain("blur-[4px]");
    expect(pendingLabelSource).toContain("blur-0");
    expect(pendingLabelSource).toContain("cubic-bezier(0.2,0,0,1)");
  });

  test("uses the stable pending-label primitive at asynchronous action boundaries", async () => {
    const actionSources = await Promise.all(
      [
        "components/favorite-button.tsx",
        "components/sign-in-form.tsx",
        "components/sign-up-form.tsx",
      ].map(readWebSource),
    );

    for (const source of actionSources) {
      expect(source).toContain("<PendingButtonLabel");
    }
  });
});
