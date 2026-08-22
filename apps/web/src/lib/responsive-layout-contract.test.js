import { describe, expect, test } from "bun:test";

const webSourceRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../../../", import.meta.url);

async function readWebSource(path) {
  return Bun.file(new URL(path, webSourceRoot)).text();
}

async function readRepositorySource(path) {
  return Bun.file(new URL(path, repositoryRoot)).text();
}

describe("responsive layout contract", () => {
  test("allows the document to contract below the former hard minimum without page overflow", async () => {
    const css = await readWebSource("index.css");

    expect(css).toMatch(/html\s*\{[\s\S]*?overflow-x:\s*clip/u);
    expect(css).toMatch(/body\s*\{[\s\S]*?min-width:\s*0/u);
    expect(css).toMatch(/body\s*\{[\s\S]*?overflow-x:\s*clip/u);
    expect(css).not.toContain("min-width: 20rem");
  });

  test("uses a disclosure below lg and keeps the desktop primary navigation above lg", async () => {
    const header = await readWebSource("components/header.tsx");

    expect(header).toContain('<details className="group relative lg:hidden">');
    expect(header).toContain('aria-label="Mobile navigation"');
    expect(header).toContain('aria-label="Primary" className="hidden min-w-0');
    expect(header).toContain("lg:flex");
    expect(header).toContain("w-[min(20rem,calc(100vw-1rem))]");
  });

  test("wraps feed controls into complete rows instead of pushing controls off-screen", async () => {
    const toolbar = await readWebSource("components/feed-toolbar.tsx");

    expect(toolbar).toContain("grid-cols-1");
    expect(toolbar).toContain("min-[360px]:grid-cols-2");
    expect(toolbar).toContain("sm:grid-cols-3");
    expect(toolbar).toContain("relative col-span-full grid min-w-0");
    expect(toolbar).not.toContain("overflow-x-auto");
  });

  test("keeps primary inputs and controls at least 48px on coarse mobile layouts", async () => {
    const [button, input, header] = await Promise.all([
      readRepositorySource("packages/ui/src/components/button.tsx"),
      readRepositorySource("packages/ui/src/components/input.tsx"),
      readWebSource("components/header.tsx"),
    ]);

    expect(button).toContain('"h-12 gap-1.5');
    expect(button).toContain('icon: "size-12');
    expect(input).toContain('"h-12 w-full min-w-0');
    expect(header).toContain("size-12 cursor-pointer");
  });

  test("stacks artwork metadata before there is room for a label and value column", async () => {
    const artwork = await readWebSource("routes/art.$slug.tsx");

    expect(artwork).toContain("grid-cols-1 gap-1");
    expect(artwork).toContain("min-[360px]:grid-cols-[7rem_minmax(0,1fr)]");
    expect(artwork).toContain("break-words text-left");
  });
});
