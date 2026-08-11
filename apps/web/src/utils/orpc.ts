import type { AppRouter } from "@art/api/routers/index";
import { env } from "@art/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { isUnauthorizedError } from "@/lib/orpc-error";
import { getForwardedAuthHeaders } from "@/lib/ssr-auth-cookie";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isUnauthorizedError(error)) return;

        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

function getServerUrl(url: string) {
  const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`;
  }

  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return `${origin}${normalized}`;
  }

  return `http://localhost:3000${normalized}`;
}

const getRequestAuthHeaders = createIsomorphicFn()
  .server(async () => {
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    return getForwardedAuthHeaders(getRequestHeaders());
  })
  .client(() => ({}));

const link = new RPCLink({
  url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
  async fetch(request, options) {
    const headers = new Headers(request.headers);
    const requestAuthHeaders = await getRequestAuthHeaders();
    for (const [name, value] of Object.entries(requestAuthHeaders)) {
      headers.set(name, value);
    }

    return fetch(request, {
      ...options,
      headers,
      credentials: "include",
    });
  },
});

const getORPCClient = () => {
  return createORPCClient(link) as RouterClient<AppRouter>;
};

export const client: RouterClient<AppRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
