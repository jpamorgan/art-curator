import { Toaster } from "@art/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";

import Header from "@/components/header";
import PrivateSessionBoundary from "@/components/private-session-boundary";
import { getUser } from "@/functions/get-user";
import { SiteIdentityScript } from "@/lib/site-identity";
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
        <SiteIdentityScript />
      </head>
      <body>
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-neutral-950 px-3.5 py-2 text-white focus:translate-y-0"
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
      <footer className="flex flex-wrap items-center justify-center gap-1 px-3 pb-3">
        <Link
          to="/artists"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Artists
        </Link>
        <Link
          to="/galleries"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Galleries
        </Link>
        <Link
          to="/styles"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Styles
        </Link>
        <a
          href="/llms.txt"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-solid focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Agent guide
        </a>
        <a
          href="https://github.com/jpamorgan/art-curator"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-solid focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Source
        </a>
        <a
          href="https://unavatar.io"
          className="inline-flex min-h-12 items-center rounded-lg px-2.5 text-base text-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-solid focus-visible:outline-neutral-950 sm:text-sm lg:min-h-10"
        >
          Avatars provided by Unavatar
        </a>
      </footer>
    </div>
  );
}
