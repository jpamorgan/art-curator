import { describe, expect, test } from "bun:test";

import { toPublicUserSession } from "./public-session";

describe("public SSR session projection", () => {
  test("serializes only the user identity needed by the UI", () => {
    const projected = toPublicUserSession({
      session: {
        id: "internal-session-id",
        token: "never-dehydrate-this-token",
        ipAddress: "203.0.113.7",
        userAgent: "private-user-agent",
        userId: "user-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
      user: {
        id: "user-1",
        name: "Curator",
        email: "curator@example.com",
        emailVerified: true,
        image: "https://example.com/private-avatar.jpg",
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
    });

    expect(projected).toEqual({
      user: {
        id: "user-1",
        name: "Curator",
        email: "curator@example.com",
      },
    });

    const dehydrated = JSON.stringify(projected);
    expect(dehydrated).not.toContain("never-dehydrate-this-token");
    expect(dehydrated).not.toContain("internal-session-id");
    expect(dehydrated).not.toContain("203.0.113.7");
    expect(dehydrated).not.toContain("private-user-agent");
    expect(dehydrated).not.toContain("private-avatar");
  });

  test("preserves an unauthenticated request as null", () => {
    expect(toPublicUserSession(null)).toBeNull();
  });
});
