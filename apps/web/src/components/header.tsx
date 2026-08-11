import { Skeleton } from "@art/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import SubmissionDialog from "@/components/submission-dialog";
import UserMenu from "@/components/user-menu";
import {
  buildHeaderFilters,
  headerFilterIdentity,
  selectedHeaderFilterIdentity,
} from "@/lib/header-filters";
import type { PublicUserSession } from "@/lib/public-session";
import { orpc } from "@/utils/orpc";

const SORT_OPTIONS = [
  { value: "recent", label: "Recent" },
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
] as const;

type SortOrder = (typeof SORT_OPTIONS)[number]["value"];

type GallerySearch = {
  category?: string;
  style?: string;
  sort?: SortOrder;
};

function readGallerySearch(search: unknown): GallerySearch {
  if (!search || typeof search !== "object") return {};

  const candidate = search as Record<string, unknown>;
  const category = typeof candidate.category === "string" ? candidate.category : undefined;
  const style = typeof candidate.style === "string" ? candidate.style : undefined;
  const sort = SORT_OPTIONS.some((option) => option.value === candidate.sort)
    ? (candidate.sort as SortOrder)
    : undefined;

  return { category, style, sort };
}

export default function Header({ initialSession }: { initialSession: PublicUserSession | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isNavigating = useRouterState({ select: (state) => state.status === "pending" });
  const categoriesQuery = useQuery(orpc.artworks.categories.queryOptions());
  const search = readGallerySearch(location.search);
  const selectedFilter = selectedHeaderFilterIdentity(search);
  const selectedSort = search.sort ?? "recent";
  const filters = buildHeaderFilters(
    categoriesQuery.data?.categories ?? [],
    categoriesQuery.data?.styles ?? [],
  );

  function updateSearch(next: GallerySearch) {
    void navigate({
      to: "/",
      search: { category: next.category, style: next.style, sort: next.sort },
    });
  }

  function updateSort(sort: SortOrder) {
    const galleryMatch = location.pathname.match(/^\/galleries\/([^/]+)\/?$/);
    if (galleryMatch?.[1]) {
      void navigate({
        to: "/galleries/$slug",
        params: { slug: galleryMatch[1] },
        search: { sort },
      });
      return;
    }

    const styleMatch = location.pathname.match(/^\/styles\/([^/]+)\/?$/);
    if (styleMatch?.[1]) {
      void navigate({
        to: "/styles/$slug",
        params: { slug: styleMatch[1] },
        search: { sort },
      });
      return;
    }

    updateSearch({ category: search.category, style: search.style, sort });
  }

  const hasSort =
    location.pathname === "/" ||
    /^\/galleries\/[^/]+\/?$/.test(location.pathname) ||
    /^\/styles\/[^/]+\/?$/.test(location.pathname);

  return (
    <header className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.08)] backdrop-blur-md">
      <div className="flex min-h-14 flex-wrap items-center gap-x-1 px-1 sm:gap-x-3 sm:px-3 lg:flex-nowrap">
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Link
            to="/"
            aria-label="Homepage"
            className="relative flex min-h-12 min-w-10 items-center justify-center rounded-full px-1.5 font-semibold tracking-[-0.04em] text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:px-2"
          >
            art.
          </Link>
          <Link
            to="/favorites"
            className="flex min-h-10 items-center rounded-full bg-neutral-100 px-2.5 text-base text-neutral-700 transition-transform duration-150 ease-out hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:px-3 sm:text-sm"
          >
            Favorites
          </Link>
          <SubmissionDialog />
          <div className="max-sm:[&_a]:px-2.5 max-sm:[&_button]:px-2.5">
            <UserMenu initialSession={initialSession} />
          </div>
        </div>

        <nav
          aria-label="Browse art"
          aria-busy={categoriesQuery.isPending}
          className="order-last flex min-w-0 basis-full items-center gap-1.5 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:order-none lg:basis-auto lg:flex-1"
        >
          <Link
            to="/galleries"
            className="flex min-h-10 shrink-0 items-center rounded-full px-3 text-base text-neutral-500 transition-transform duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm"
            activeProps={{ className: "bg-neutral-100 text-neutral-950" }}
          >
            Galleries
          </Link>
          <Link
            to="/styles"
            className="flex min-h-10 shrink-0 items-center rounded-full px-3 text-base text-neutral-500 transition-transform duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm"
            activeProps={{ className: "bg-neutral-100 text-neutral-950" }}
          >
            Styles
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-black/10" />
          {categoriesQuery.isPending
            ? ["w-12", "w-16", "w-14", "w-24", "w-28", "w-20"].map((width) => (
                <Skeleton
                  key={width}
                  className={`h-10 shrink-0 rounded-full bg-neutral-100 ${width}`}
                />
              ))
            : null}
          {filters.map((filter) => {
            const filterIdentity = headerFilterIdentity(filter);
            const isSelected = location.pathname === "/" && selectedFilter === filterIdentity;
            const filterSearch = {
              category: filter.kind === "category" ? filter.slug : undefined,
              style: filter.kind === "style" ? filter.slug : undefined,
              sort: search.sort,
            };

            return (
              <Link
                key={filterIdentity}
                to="/"
                search={filterSearch}
                aria-current={isSelected ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center rounded-full px-3 text-base transition-transform duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm ${isSelected ? "bg-neutral-950 text-white hover:bg-neutral-950 hover:text-white" : "text-neutral-500"}`}
              >
                {filter.name}
              </Link>
            );
          })}
        </nav>

        {hasSort ? (
          <div className="ml-auto shrink-0 py-2 lg:ml-0">
            <label
              className="inline-grid grid-cols-[1fr_--spacing(7)] sm:grid-cols-[1fr_--spacing(8)]"
              title="Sort artwork"
            >
              <span className="sr-only">Sort artwork</span>
              <select
                name="sort"
                aria-label="Sort artwork"
                value={selectedSort}
                className="col-span-full row-start-1 min-h-10 cursor-pointer appearance-none rounded-full bg-white py-2 pr-7 pl-2.5 text-base text-neutral-800 ring-1 ring-black/10 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:pr-8 sm:pl-3 sm:text-sm"
                onChange={(event) => updateSort(event.currentTarget.value as SortOrder)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center stroke-neutral-500"
              />
            </label>
          </div>
        ) : null}
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
