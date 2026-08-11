import { describe, expect, test } from "bun:test";

import { handleCrossTabSignout, isSignoutBroadcast } from "./cross-tab-signout";

describe("cross-tab sign-out", () => {
  test("recognizes only Better Auth sign-out session broadcasts", () => {
    expect(isSignoutBroadcast({ event: "session", data: { trigger: "signout" } })).toBe(true);
    expect(isSignoutBroadcast({ event: "session", data: { trigger: "updateUser" } })).toBe(false);
    expect(isSignoutBroadcast({ event: "other", data: { trigger: "signout" } })).toBe(false);
  });

  test("fails closed before an authoritative refetch that rejects", async () => {
    const calls = [];

    await expect(
      handleCrossTabSignout({
        pathname: "/favorites",
        clearPrivateArt: () => calls.push("clear"),
        redirectToLogin: () => calls.push("redirect"),
        refetchSession: async () => {
          calls.push("refetch");
          throw new Error("offline");
        },
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual(["clear", "redirect", "refetch"]);
  });

  test("clears other routes without redirecting them", async () => {
    const calls = [];

    await handleCrossTabSignout({
      pathname: "/",
      clearPrivateArt: () => calls.push("clear"),
      redirectToLogin: () => calls.push("redirect"),
      refetchSession: async () => calls.push("refetch"),
    });

    expect(calls).toEqual(["clear", "refetch"]);
  });
});
