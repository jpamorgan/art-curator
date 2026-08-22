import { describe, expect, test } from "bun:test";

const webSourceRoot = new URL("../", import.meta.url);

async function readWebSource(path) {
  return Bun.file(new URL(path, webSourceRoot)).text();
}

describe("button style contract", () => {
  test("uses compact rounded rectangles for text buttons and circles for icon buttons", async () => {
    const buttonSource = await Bun.file(
      new URL("../../../../packages/ui/src/components/button.tsx", import.meta.url),
    ).text();

    expect(buttonSource).toContain("justify-center rounded-lg");
    expect(buttonSource).toContain('default:\n          "h-12 gap-1.5 px-3.5');
    expect(buttonSource).toContain("sm:pointer-fine:h-10");
    expect(buttonSource).toContain('icon: "size-12 rounded-full sm:pointer-fine:size-8"');
    expect(buttonSource.match(/rounded-full/gu)).toHaveLength(4);
    expect(buttonSource).toContain("active:not-aria-[haspopup]:scale-[0.96]");
    expect(buttonSource).not.toContain("translate-y-px");
  });

  test("keeps the header tabs compact without shrinking their hit area", async () => {
    const headerSource = await readWebSource("components/header.tsx");

    expect(headerSource).toContain("h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5");
    expect(headerSource).toContain("after:h-10");
    expect(headerSource).not.toMatch(/Compass|Sparkles/u);
    expect(headerSource).toContain('isExplore ? "bg-neutral-100 text-neutral-950"');
    expect(headerSource).toMatch(/aria-label="Saved"[\s\S]*?rounded-full/u);
    expect(headerSource).toContain('<details className="group relative lg:hidden">');
    expect(headerSource).toContain('aria-label="Open navigation"');
    expect(headerSource).toContain("size-12 cursor-pointer");
  });

  test("keeps text actions rectangular across app states", async () => {
    const actionSources = await Promise.all(
      [
        "components/art-gallery.tsx",
        "components/browse-index.tsx",
        "components/filtered-gallery-page.tsx",
        "components/route-unavailable.tsx",
        "components/sign-in-form.tsx",
        "components/sign-up-form.tsx",
        "routes/login.tsx",
      ].map(readWebSource),
    );

    for (const source of actionSources) {
      expect(source).not.toMatch(/<button\b[^>]*className="[^"]*rounded-full/u);
    }
  });

  test("spaces the logout action away from its divider", async () => {
    const menuSource = await readWebSource("components/user-menu.tsx");

    expect(menuSource).toContain('<DropdownMenuSeparator className="my-1 bg-black/10" />');
  });
});
