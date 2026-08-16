import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { Bookmark, Compass, Sparkles } from "lucide-react";

import SubmissionDialog from "@/components/submission-dialog";
import UserMenu from "@/components/user-menu";
import type { PublicUserSession } from "@/lib/public-session";

function isForYouSearch(search: unknown) {
  return (
    typeof search === "object" &&
    search !== null &&
    (search as Record<string, unknown>).feed === "for-you"
  );
}

export default function Header({ initialSession }: { initialSession: PublicUserSession | null }) {
  const location = useLocation();
  const isNavigating = useRouterState({
    select: (state) => state.status === "pending",
  });
  const isHome = location.pathname === "/";
  const isForYou = isHome && isForYouSearch(location.search);
  const isExplore = isHome && !isForYou;

  const tabClassName =
    "flex h-10 shrink-0 items-center gap-1 rounded-full px-1 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none sm:gap-1.5 sm:px-3 sm:text-sm";

  return (
    <header className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.08)] backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-0.5 px-1 sm:gap-3 sm:px-3">
        <div className="flex min-w-0 items-center">
          <Link
            to="/"
            search={{ category: undefined, style: undefined, sort: undefined, feed: undefined }}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            aria-label="Art home"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl font-semibold tracking-[-0.04em] text-neutral-950 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none"
          >
            Art
          </Link>
          <nav aria-label="Primary" className="flex min-w-0 items-center">
            <Link
              to="/"
              search={{ category: undefined, style: undefined, sort: undefined, feed: undefined }}
              activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
              aria-current={isExplore ? "page" : undefined}
              className={`${tabClassName} ${isExplore ? "bg-neutral-950 text-white hover:bg-neutral-950 hover:text-white" : "text-neutral-600"}`}
            >
              <Compass aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
              <span>Explore</span>
            </Link>
            <Link
              to="/"
              search={{ category: undefined, style: undefined, sort: undefined, feed: "for-you" }}
              activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
              aria-current={isForYou ? "page" : undefined}
              className={`${tabClassName} ${isForYou ? "bg-neutral-950 text-white hover:bg-neutral-950 hover:text-white" : "text-neutral-600"}`}
            >
              <Sparkles aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
              <span>For you</span>
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center">
          <Link
            to="/favorites"
            aria-label="Saved"
            aria-current={location.pathname === "/favorites" ? "page" : undefined}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none"
          >
            <Bookmark aria-hidden="true" className="size-4.5 shrink-0 stroke-[1.75]" />
          </Link>
          <SubmissionDialog />
          <div className="shrink-0">
            <UserMenu initialSession={initialSession} />
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
      >
        <div className="navigation-progress h-full bg-neutral-950" data-active={isNavigating} />
      </div>
    </header>
  );
}
