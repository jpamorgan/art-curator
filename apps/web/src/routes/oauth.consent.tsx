import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { isValidOAuthConsentRequest, OAUTH_SCOPE_DESCRIPTIONS } from "@/lib/oauth-consent";

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: z.object({
    client_id: z.string().max(512).optional(),
    scope: z.string().max(2_048).optional(),
    redirect_uri: z.url().max(2_048).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Authorize agent access — Art" },
      {
        name: "description",
        content: "Review and authorize an agent application's access to Art.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const { client_id: clientId, redirect_uri: redirectUri, scope } = Route.useSearch();
  const [client, setClient] = useState<{ name: string; uri?: string } | null>(null);
  const [clientLookupFailed, setClientLookupFailed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopes = useMemo(() => [...new Set((scope ?? "").split(/\s+/u).filter(Boolean))], [scope]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    void authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then((result) => {
        if (!active) return;
        if (!result.data?.client_name) {
          setClientLookupFailed(true);
          return;
        }
        setClient({
          name: result.data.client_name,
          ...(result.data.client_uri ? { uri: result.data.client_uri } : {}),
        });
      })
      .catch(() => {
        if (active) setClientLookupFailed(true);
      });
    return () => {
      active = false;
    };
  }, [clientId]);
  const hasKnownScopes =
    scopes.length > 0 && scopes.every((name) => name in OAUTH_SCOPE_DESCRIPTIONS);
  const isValidRequest = isValidOAuthConsentRequest({
    clientId,
    redirectUri,
    scopes,
    clientResolved: Boolean(client),
  });

  async function decide(accept: boolean) {
    if (accept && !isValidRequest) {
      setError("This authorization request is incomplete or invalid.");
      return;
    }
    setError(null);
    setIsPending(true);
    try {
      const result = await authClient.oauth2.consent({
        accept,
        ...(accept && scope ? { scope } : {}),
      });
      if (result.error) {
        setError(result.error.message || "The authorization request could not be completed.");
        return;
      }
      const redirectUri = result.data?.url;
      if (!result.data?.redirect || !redirectUri) {
        setError("The authorization server did not return a redirect URI.");
        return;
      }
      window.location.assign(redirectUri);
    } catch {
      setError("The authorization request could not be completed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-white px-5 py-14 text-neutral-950 sm:py-20">
      <section className="mx-auto flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-neutral-500">Agent authorization</p>
          <h1 className="text-balance text-3xl font-medium tracking-tight">
            Allow this application to access Art?
          </h1>
          <p className="text-pretty text-base leading-7 text-neutral-600">
            <span className="font-medium text-neutral-950">
              {client?.name ?? "This application"}
            </span>{" "}
            is requesting the permissions below. Only continue if you initiated this request.
          </p>
          {client?.uri && (
            <p className="break-all text-sm text-neutral-600">Application website: {client.uri}</p>
          )}
          {redirectUri && (
            <p className="break-all text-sm text-neutral-600">
              After approval, Art will return control to: {redirectUri}
            </p>
          )}
          {clientId && (
            <p className="break-all font-mono text-xs text-neutral-500">Client ID: {clientId}</p>
          )}
        </div>

        {(clientLookupFailed || !clientId || !redirectUri || !hasKnownScopes) && (
          <p className="text-pretty text-sm text-red-700" role="alert">
            This authorization request is incomplete or invalid. Return to the application and start
            again.
          </p>
        )}

        <div className="rounded-2xl border border-black/10 bg-neutral-50 p-5">
          <h2 className="text-sm font-medium">Requested permissions</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {scopes.map((requestedScope) => (
              <li key={requestedScope} className="flex flex-col gap-1">
                <code className="text-sm font-medium">{requestedScope}</code>
                <span className="text-sm leading-6 text-neutral-600">
                  {OAUTH_SCOPE_DESCRIPTIONS[requestedScope] ??
                    "A permission declared by this client."}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <p className="text-pretty text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={isPending || !isValidRequest}
            onClick={() => void decide(false)}
            className="h-12 rounded-xl border border-black/15 bg-white px-4 text-base font-medium outline-none transition-transform active:not-disabled:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={isPending || !isValidRequest}
            onClick={() => void decide(true)}
            className="h-12 rounded-xl bg-neutral-950 px-4 text-base font-medium text-white outline-none transition-transform active:not-disabled:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
          >
            {isPending ? "Working…" : "Allow access"}
          </button>
        </div>
      </section>
    </div>
  );
}
