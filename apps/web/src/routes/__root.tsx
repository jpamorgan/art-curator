import { Toaster } from "@art/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

import Header from "@/components/header";
import PrivateSessionBoundary from "@/components/private-session-boundary";
import { getUser } from "@/functions/get-user";
import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async () => ({
    session: await getUser().catch(() => null),
  }),
  loader: ({ context }) =>
    context.queryClient.prefetchQuery(context.orpc.artworks.categories.queryOptions()),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Art" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootApp,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-50 -translate-y-20 rounded-full bg-neutral-950 px-3 py-2 text-white focus:translate-y-0"
        >
          Skip to content
        </a>
        {children}
        <Toaster richColors />
        <Scripts />
      </body>
    </html>
  );
}

function RootApp() {
  const { session } = Route.useRouteContext();

  return (
    <div className="isolate min-h-dvh bg-white text-neutral-950">
      <PrivateSessionBoundary />
      <Header initialSession={session} />
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
