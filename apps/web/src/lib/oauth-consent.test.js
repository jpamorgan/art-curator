import { describe, expect, test } from "bun:test";

import { isValidOAuthConsentRequest } from "./oauth-consent";

describe("OAuth consent request validation", () => {
  test("enables consent only after resolving a complete request with known scopes", () => {
    const valid = {
      clientId: "public-client",
      redirectUri: "http://127.0.0.1:49152/callback",
      scopes: ["offline_access", "art:read"],
      clientResolved: true,
    };
    expect(isValidOAuthConsentRequest(valid)).toBe(true);
    expect(isValidOAuthConsentRequest({ ...valid, clientId: undefined })).toBe(false);
    expect(isValidOAuthConsentRequest({ ...valid, redirectUri: undefined })).toBe(false);
    expect(isValidOAuthConsentRequest({ ...valid, scopes: [] })).toBe(false);
    expect(isValidOAuthConsentRequest({ ...valid, scopes: ["art:write"] })).toBe(false);
    expect(isValidOAuthConsentRequest({ ...valid, clientResolved: false })).toBe(false);
  });
});
