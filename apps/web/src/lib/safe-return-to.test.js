import { describe, expect, test } from "bun:test";

import { getSafeReturnTo } from "./safe-return-to";

describe("getSafeReturnTo", () => {
  test.each([
    undefined,
    "",
    "//evil.example/phish",
    "///evil.example/phish",
    "\\\\evil.example\\phish",
    "/\\evil.example/phish",
    "https://evil.example/phish",
    "javascript:alert(1)",
    "%2F%2Fevil.example%2Fphish",
    "/%2Fevil.example/phish",
    "/%252Fevil.example/phish",
    "/%5Cevil.example/phish",
    "/%255Cevil.example/phish",
  ])("falls back for unsafe return target %p", (value) => {
    expect(getSafeReturnTo(value)).toBe("/favorites");
  });

  test.each([
    ["/", "/"],
    ["/favorites", "/favorites"],
    ["/art/the-school-of-athens?view=full#details", "/art/the-school-of-athens?view=full#details"],
    ["/search?q=https%3A%2F%2Fexample.com%2Fart", "/search?q=https%3A%2F%2Fexample.com%2Fart"],
    ["/favorites?next=%2Fsafe", "/favorites?next=%2Fsafe"],
  ])("preserves safe local target %s", (value, expected) => {
    expect(getSafeReturnTo(value)).toBe(expected);
  });
});
