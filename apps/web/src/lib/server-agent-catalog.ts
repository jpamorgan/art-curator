import type { AppRouter } from "@art/api/routers/index";
import { env } from "@art/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
  url: `${env.VITE_SERVER_URL.replace(/\/$/u, "")}/rpc`,
  fetch(request, options) {
    return fetch(request, {
      ...options,
      credentials: "omit",
    });
  },
});

export const agentCatalogClient = createORPCClient(link) as RouterClient<AppRouter>;
