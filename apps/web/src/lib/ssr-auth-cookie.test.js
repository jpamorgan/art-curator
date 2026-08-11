import { describe, expect, test } from "bun:test";

import { getForwardedAuthCookie, getForwardedAuthHeaders } from "./ssr-auth-cookie";

describe("SSR auth cookie forwarding", () => {
  test("forwards only Better Auth session cookies", () => {
    const headers = new Headers({
      authorization: "Bearer must-not-cross-the-boundary",
      cookie:
        "analytics=private; better-auth.session_token=local-token; __Secure-better-auth.session_data=cached%3Dsession; theme=dark",
      origin: "https://attacker.example",
    });

    expect(getForwardedAuthCookie(headers)).toBe(
      "better-auth.session_token=local-token; __Secure-better-auth.session_data=cached%3Dsession",
    );
    expect(getForwardedAuthHeaders(headers)).toEqual({
      cookie:
        "better-auth.session_token=local-token; __Secure-better-auth.session_data=cached%3Dsession",
    });
  });

  test("does not create a Cookie header when no auth session cookie is present", () => {
    const headers = new Headers({ cookie: "analytics=private; theme=dark" });

    expect(getForwardedAuthCookie(headers)).toBeNull();
    expect(getForwardedAuthHeaders(headers)).toEqual({});
  });

  test("preserves equals signs inside signed cookie values", () => {
    const headers = new Headers({ cookie: "better-auth.session_token=signed=value==" });

    expect(getForwardedAuthCookie(headers)).toBe("better-auth.session_token=signed=value==");
  });
});
