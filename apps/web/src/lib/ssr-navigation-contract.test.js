import { describe, expect, test } from "bun:test";

const sourceRoot = new URL("../", import.meta.url);
const routeFiles = [
  "routes/__root.tsx",
  "routes/index.tsx",
  "routes/galleries.index.tsx",
  "routes/galleries.$slug.tsx",
  "routes/styles.index.tsx",
  "routes/styles.$slug.tsx",
  "routes/art.$slug.tsx",
  "routes/login.tsx",
  "routes/_auth/route.tsx",
  "routes/_auth/favorites.tsx",
];

async function readSource(path) {
  return Bun.file(new URL(path, sourceRoot)).text();
}

describe("SSR and hydrated navigation contract", () => {
  test("keeps full SSR enabled and intent preloading global", async () => {
    const routerSource = await readSource("router.tsx");
    const routeSource = await Promise.all(routeFiles.map(readSource));

    expect(routerSource).toContain('defaultPreload: "intent"');
    expect(routeSource.join("\n")).not.toMatch(/ssr\s*:\s*false/u);
  });

  test("uses explicit pending timings that avoid flashes without making navigation feel stalled", async () => {
    const routerSource = await readSource("router.tsx");

    expect(routerSource).toContain("defaultPendingMs: 180");
    expect(routerSource).toContain("defaultPendingMinMs: 280");
  });

  test("uses route-shaped pending surfaces for every data-backed destination", async () => {
    const pendingContracts = [
      ["routes/index.tsx", /pendingComponent:\s*GalleryPageSkeleton/u],
      [
        "routes/galleries.index.tsx",
        /pendingComponent:\s*\(\)\s*=>\s*<BrowseIndexSkeleton\s+kind="galleries"\s*\/>/u,
      ],
      [
        "routes/styles.index.tsx",
        /pendingComponent:\s*\(\)\s*=>\s*<BrowseIndexSkeleton\s+kind="styles"\s*\/>/u,
      ],
      ["routes/_auth/favorites.tsx", /pendingComponent:\s*GalleryPageSkeleton/u],
      [
        "routes/galleries.$slug.tsx",
        /pendingComponent:\s*\(\)\s*=>\s*<FilteredGalleryPageSkeleton\s+filter="gallery"\s*\/>/u,
      ],
      [
        "routes/styles.$slug.tsx",
        /pendingComponent:\s*\(\)\s*=>\s*<FilteredGalleryPageSkeleton\s+filter="style"\s*\/>/u,
      ],
      ["routes/art.$slug.tsx", /pendingComponent:\s*ArtworkDetailSkeleton/u],
    ];

    for (const [path, pendingComponentPattern] of pendingContracts) {
      const routeSource = await readSource(path);

      expect(routeSource).toMatch(pendingComponentPattern);
      expect(routeSource).not.toMatch(/pendingComponent\s*:\s*(?:Loader|\(\)\s*=>\s*<Loader)/u);
    }
  });

  test("uses the TanStack Start shell boundary without duplicating the route match tree", async () => {
    const rootSource = await readSource("routes/__root.tsx");
    const artworkSource = await readSource("routes/art.$slug.tsx");

    expect(rootSource).toContain("shellComponent: RootDocument");
    expect(rootSource).toContain("component: RootApp");
    expect(rootSource).toMatch(/function RootDocument\(\{ children \}/u);
    expect(rootSource).toContain("{children}");
    expect(rootSource).not.toContain("component: RootDocument");
    expect(rootSource).toMatch(/function RootApp\(\)[\s\S]*?<Outlet \/>/u);
    expect(artworkSource).not.toContain("<main");
  });

  test("prefetches substantive data for every data-backed page", async () => {
    const dataRoutes = await Promise.all(
      [
        "routes/index.tsx",
        "routes/galleries.index.tsx",
        "routes/galleries.$slug.tsx",
        "routes/styles.index.tsx",
        "routes/styles.$slug.tsx",
        "routes/art.$slug.tsx",
        "routes/_auth/favorites.tsx",
      ].map(readSource),
    );

    for (const routeSource of dataRoutes) {
      expect(routeSource).toMatch(/loader\s*:/u);
      expect(routeSource).toMatch(/ensure(?:Infinite)?QueryData/u);
    }
  });

  test("loads collection metadata and artwork concurrently", async () => {
    const collectionRoutes = await Promise.all(
      ["routes/galleries.$slug.tsx", "routes/styles.$slug.tsx"].map(readSource),
    );

    for (const routeSource of collectionRoutes) {
      expect(routeSource).toMatch(/loader:\s*async[\s\S]*?loadBrowseRouteData\(/u);
      expect(routeSource).toMatch(
        /loadBrowseRouteData\([\s\S]*?ensureQueryData[\s\S]*?ensureInfiniteQueryData/u,
      );
    }
  });

  test("reuses the root session for protected routes", async () => {
    const protectedRoute = await readSource("routes/_auth/route.tsx");

    expect(protectedRoute).toContain("const session = context.session");
    expect(protectedRoute).not.toContain("getUser()");
  });

  test("provides deliberate error surfaces for every data and auth boundary", async () => {
    const errorBoundaryFiles = [
      "routes/index.tsx",
      "routes/galleries.index.tsx",
      "routes/galleries.$slug.tsx",
      "routes/styles.index.tsx",
      "routes/styles.$slug.tsx",
      "routes/art.$slug.tsx",
      "routes/_auth/route.tsx",
      "routes/_auth/favorites.tsx",
    ];

    for (const routeSource of await Promise.all(errorBoundaryFiles.map(readSource))) {
      expect(routeSource).toMatch(/errorComponent\s*:/u);
    }

    const unavailableSource = await readSource("components/route-unavailable.tsx");
    expect(unavailableSource).toContain("router.invalidate()");
    expect(unavailableSource).not.toContain("onClick={reset}");
  });

  test("uses hydrated router links for site navigation", async () => {
    const componentFiles = [
      "components/artwork-card.tsx",
      "components/browse-index.tsx",
      "components/filtered-gallery-page.tsx",
      "components/header.tsx",
      "components/user-menu.tsx",
      "routes/art.$slug.tsx",
    ];
    const componentSource = (await Promise.all(componentFiles.map(readSource))).join("\n");

    expect(componentSource).not.toMatch(/<a\s[^>]*href=["']\//u);
    expect(componentSource).not.toMatch(/window\.location\.(?:assign|replace)/u);

    const headerSource = await readSource("components/header.tsx");
    expect(headerSource).not.toMatch(/filters\.map[\s\S]*?<button/u);
    expect(headerSource).toMatch(/filters\.map[\s\S]*?<Link/u);

    const userMenuSource = await readSource("components/user-menu.tsx");
    expect(userMenuSource).toMatch(/render=\{<Link to="\/favorites" \/>\}/u);
    expect(userMenuSource).not.toContain('navigate({ to: "/favorites" })');
  });
});
