import { describe, expect, test } from "bun:test";

const sourceRoot = new URL("../", import.meta.url);

async function readSource(path) {
  return Bun.file(new URL(path, sourceRoot)).text();
}

describe("recommendation UI contract", () => {
  test("exposes all three discovery surfaces and keeps Favorites separate", async () => {
    const header = await readSource("components/header.tsx");
    expect(header).toContain("<span>Explore</span>");
    expect(header).toContain("<span>For you</span>");
    expect(header).toContain("<span>Following</span>");
    expect(header).toContain('to="/favorites"');
  });

  test("keeps recommendation feedback visible and reversible", async () => {
    const card = await readSource("components/artwork-card.tsx");
    const gallery = await readSource("components/recommendation-gallery.tsx");
    expect(card).toContain("Not for me");
    expect(gallery).toContain('label: "Undo"');
    expect(gallery).toContain("onUndoHide");
  });

  test("batches opaque recommendation analytics and never sends user identity", async () => {
    const gallery = await readSource("components/recommendation-gallery.tsx");
    expect(gallery).toContain("orpc.recommendations.track.mutationOptions()");
    expect(gallery).toContain("recommendationToken");
    expect(gallery).toContain('type: "impression"');
    expect(gallery).toContain('queueTracking(artwork.id, "open")');
    expect(gallery).not.toMatch(/userId|email/u);
  });

  test("lets signed-in users refine Explore as well as personalized feeds", async () => {
    const home = await readSource("routes/index.tsx");
    expect(home).toContain("canHide={Boolean(session)}");
  });

  test("refreshes the taste profile as onboarding favorites change", async () => {
    const favoriteButton = await readSource("components/favorite-button.tsx");
    expect(favoriteButton).toContain("invalidateQueries({ queryKey: orpc.recommendations.key() })");
  });

  test("supports seeded radio and unseeded Explore and For You", async () => {
    const home = await readSource("routes/index.tsx");
    const radio = await readSource("components/artwork-radio.tsx");
    expect(home).not.toContain("seedArtworkId:");
    expect(radio).toContain("seedArtworkId: artworkId");
    expect(radio).toContain("setDiscovery(level)");
    expect(radio).toContain("Personalized");
  });

  test("uses a public cache key only for user-independent recommendation requests", async () => {
    const options = await readSource("lib/discovery-options.ts");
    expect(options).toContain("if (!parameters.personalized)");
    expect(options).toContain("scopePrivateQueryKey(");
    expect(options.indexOf("if (!parameters.personalized)")).toBeLessThan(
      options.indexOf("scopePrivateQueryKey("),
    );
  });
});
