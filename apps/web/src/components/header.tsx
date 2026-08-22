import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { Bookmark, Check, Menu } from "lucide-react";

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

function closeMobileNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function MobileNavigation({
  isExplore,
  isFollowing,
  isForYou,
  pathname,
}: {
  isExplore: boolean;
  isFollowing: boolean;
  isForYou: boolean;
  pathname: string;
}) {
  const linkClassName =
    "flex min-h-12 items-center justify-between gap-4 rounded-xl px-3.5 text-base font-medium text-neutral-700 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.98]";

  return (
    <details className="group relative lg:hidden">
      <summary
        aria-label="Open navigation"
        className="relative flex size-12 cursor-pointer list-none items-center justify-center rounded-full text-neutral-700 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] [&::-webkit-details-marker]:hidden"
      >
        <Menu aria-hidden="true" className="size-5 shrink-0 stroke-[1.75]" />
      </summary>
      <nav
        aria-label="Mobile navigation"
        className="absolute top-[calc(100%+0.5rem)] right-0 z-50 flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08),0_12px_32px_-10px_rgba(0,0,0,0.24)]"
      >
        <Link
          to="/"
          search={{ category: undefined, style: undefined, sort: undefined, feed: undefined }}
          aria-current={isExplore ? "page" : undefined}
          className={`${linkClassName} ${isExplore ? "bg-neutral-100 text-neutral-950" : ""}`}
          onClick={closeMobileNavigation}
        >
          <span>Explore</span>
          {isExplore ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
        </Link>
        <Link
          to="/"
          search={{ category: undefined, style: undefined, sort: undefined, feed: "for-you" }}
          aria-current={isForYou ? "page" : undefined}
          className={`${linkClassName} ${isForYou ? "bg-neutral-100 text-neutral-950" : ""}`}
          onClick={closeMobileNavigation}
        >
          <span>For you</span>
          {isForYou ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
        </Link>
        <Link
          to="/following"
          aria-current={isFollowing ? "page" : undefined}
          className={`${linkClassName} ${isFollowing ? "bg-neutral-100 text-neutral-950" : ""}`}
          onClick={closeMobileNavigation}
        >
          <span>Following</span>
          {isFollowing ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
        </Link>
        <div className="my-1 h-px bg-black/10" />
        <Link
          to="/favorites"
          aria-current={pathname === "/favorites" ? "page" : undefined}
          className={`${linkClassName} ${pathname === "/favorites" ? "bg-neutral-100 text-neutral-950" : ""}`}
          onClick={closeMobileNavigation}
        >
          <span>Saved</span>
          <Bookmark aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
        </Link>
      </nav>
    </details>
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
  const isFollowing = location.pathname === "/following";

  const tabClassName =
    "relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,color,scale] duration-150 ease-out after:absolute after:inset-x-0 after:top-1/2 after:h-10 after:-translate-y-1/2 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none";

  return (
    <header className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.08)] backdrop-blur-md">
      <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-2 lg:px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            to="/"
            search={{ category: undefined, style: undefined, sort: undefined, feed: undefined }}
            activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
            aria-label="Art home"
            className="relative flex size-12 shrink-0 items-center justify-center rounded-lg text-xl font-semibold tracking-[-0.04em] text-neutral-950 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none lg:h-9 lg:w-auto lg:px-2.5"
          >
            Art
          </Link>
          <nav aria-label="Primary" className="hidden min-w-0 items-center gap-1.5 lg:flex">
            <Link
              to="/"
              search={{ category: undefined, style: undefined, sort: undefined, feed: undefined }}
              activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
              aria-current={isExplore ? "page" : undefined}
              className={`${tabClassName} ${isExplore ? "bg-neutral-100 text-neutral-950" : "text-neutral-600"}`}
            >
              <span>Explore</span>
            </Link>
            <Link
              to="/"
              search={{ category: undefined, style: undefined, sort: undefined, feed: "for-you" }}
              activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
              aria-current={isForYou ? "page" : undefined}
              className={`${tabClassName} ${isForYou ? "bg-neutral-100 text-neutral-950" : "text-neutral-600"}`}
            >
              <span>For you</span>
            </Link>
            <Link
              to="/following"
              aria-current={isFollowing ? "page" : undefined}
              className={`${tabClassName} ${isFollowing ? "bg-neutral-100 text-neutral-950" : "text-neutral-600"}`}
            >
              <span>Following</span>
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 lg:gap-0">
          <Link
            to="/favorites"
            aria-label="Saved"
            aria-current={location.pathname === "/favorites" ? "page" : undefined}
            className="hidden size-10 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-[background-color,color,scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none lg:flex"
          >
            <Bookmark aria-hidden="true" className="size-4.5 shrink-0 stroke-[1.75]" />
          </Link>
          <SubmissionDialog />
          <div className="shrink-0">
            <UserMenu initialSession={initialSession} />
          </div>
          <MobileNavigation
            isExplore={isExplore}
            isFollowing={isFollowing}
            isForYou={isForYou}
            pathname={location.pathname}
          />
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
