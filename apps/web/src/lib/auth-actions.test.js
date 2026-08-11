import { describe, expect, test } from "bun:test";

import {
  authenticateAndNavigate,
  confirmAuthenticatedSession,
  signOutAndNavigate,
} from "./auth-actions";

describe("authentication navigation", () => {
  test("both credential forms delegate to the awaited router-native transition", async () => {
    const sources = await Promise.all(
      ["../components/sign-in-form.tsx", "../components/sign-up-form.tsx"].map((path) =>
        Bun.file(new URL(path, import.meta.url)).text(),
      ),
    );

    for (const source of sources) {
      expect(source).toContain("await authenticateAndNavigate");
      expect(source).not.toMatch(/navigate\(\{\s*href:/u);
    }
  });

  test("replaces the stale document with the safe return after authentication", async () => {
    const calls = [];
    let releaseNavigation;
    const navigation = new Promise((resolve) => {
      releaseNavigation = resolve;
    });
    let settled = false;

    const action = authenticateAndNavigate({
      authenticate: async () => {
        calls.push("authenticate");
        return { error: null };
      },
      confirmSession: async () => {
        calls.push("confirm-session");
        return true;
      },
      fallbackError: "Unable to log in.",
      navigate: async (options) => {
        calls.push(["navigate", options]);
        await navigation;
      },
      returnTo: "/favorites",
    });
    void action.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual([
      "authenticate",
      "confirm-session",
      ["navigate", { to: "/favorites", replace: true, reloadDocument: true }],
    ]);
    expect(settled).toBe(false);

    releaseNavigation();
    await expect(action).resolves.toBeNull();
    expect(settled).toBe(true);
  });

  test("does not navigate after a rejected authentication result", async () => {
    let navigated = false;
    const error = await authenticateAndNavigate({
      authenticate: async () => ({ error: { message: "Wrong password." } }),
      confirmSession: async () => {
        throw new Error("must not confirm");
      },
      fallbackError: "Unable to log in.",
      navigate: async () => {
        navigated = true;
      },
      returnTo: "/favorites",
    });

    expect(error).toBe("Wrong password.");
    expect(navigated).toBe(false);
  });

  test("does not navigate until an authoritative session read succeeds", async () => {
    const reads = [false, false, true];
    const calls = [];
    const confirmed = await confirmAuthenticatedSession(async () => {
      calls.push("read");
      return reads.shift() ?? false;
    }, [0, 0, 0]);

    expect(confirmed).toBe(true);
    expect(calls).toEqual(["read", "read", "read"]);
  });

  test("keeps the user on the form when session confirmation is exhausted", async () => {
    let navigated = false;
    const error = await authenticateAndNavigate({
      authenticate: async () => ({ error: null }),
      confirmSession: async () => false,
      fallbackError: "Unable to log in.",
      navigate: async () => {
        navigated = true;
      },
      returnTo: "/favorites",
    });

    expect(error).toBe("Signed in, but your session is taking longer than expected. Try again.");
    expect(navigated).toBe(false);
  });

  test("completes sign-out, clears private state, then replaces the stale hydrated document", async () => {
    const calls = [];
    const result = await signOutAndNavigate({
      signOut: async () => {
        calls.push("sign-out");
        return { error: null };
      },
      clearPrivateArt: () => calls.push("clear-private"),
      navigate: async (options) => calls.push(["navigate", options]),
    });

    expect(result).toBeNull();
    expect(calls).toEqual([
      "sign-out",
      "clear-private",
      ["navigate", { to: "/", replace: true, reloadDocument: true }],
    ]);
  });

  test("preserves client state and location when sign-out fails", async () => {
    const calls = [];
    const result = await signOutAndNavigate({
      signOut: async () => ({ error: { message: "Offline." } }),
      clearPrivateArt: () => calls.push("clear-private"),
      navigate: async () => calls.push("navigate"),
    });

    expect(result).toBe("Offline.");
    expect(calls).toEqual([]);
  });
});
