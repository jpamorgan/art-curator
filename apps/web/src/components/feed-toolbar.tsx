import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import {
  DISCOVERY_LEVELS,
  getFilterValue,
  parseFilterValue,
  type DiscoveryLevel,
} from "@/lib/discovery";
import type { HomeSearch } from "@/lib/home-search";
import { orpc } from "@/utils/orpc";

interface FeedToolbarProps {
  feed: "explore" | "for-you";
  search: HomeSearch;
}

const selectClassName =
  "col-span-full row-start-1 h-12 w-full min-w-0 appearance-none rounded-lg bg-neutral-100 py-2 pr-8 pl-3 text-base text-neutral-800 outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-neutral-950 sm:text-sm sm:pointer-fine:h-10 lg:h-9";

function SelectChevron() {
  return (
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center stroke-neutral-500"
    />
  );
}

export function FeedToolbar({ feed, search }: FeedToolbarProps) {
  const navigate = useNavigate({ from: "/" });
  const taxonomy = useQuery(orpc.artworks.categories.queryOptions());
  const galleries = useQuery(orpc.galleries.list.queryOptions());
  const styles = useQuery(orpc.styles.list.queryOptions());
  const discovery = search.discovery ?? (feed === "explore" ? "adventurous" : "balanced");
  const selectedFilter = getFilterValue(search);

  const updateSearch = (patch: Partial<HomeSearch>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 px-2 py-2 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:px-3 lg:flex">
      {search.sort ? null : (
        <label className="relative col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_--spacing(8)] sm:col-span-1 lg:w-auto lg:shrink-0">
          <span className="sr-only">Discovery level</span>
          <select
            name="discovery"
            aria-label="Discovery level"
            value={discovery}
            className={selectClassName}
            onChange={(event) =>
              updateSearch({ discovery: event.currentTarget.value as DiscoveryLevel })
            }
          >
            {DISCOVERY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level === "familiar"
                  ? "More familiar"
                  : level === "balanced"
                    ? "Balanced"
                    : "More adventurous"}
              </option>
            ))}
          </select>
          <SelectChevron />
        </label>
      )}

      <label className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_--spacing(8)] lg:min-w-40 lg:shrink-0">
        <span className="sr-only">Filter artwork</span>
        <select
          name="artwork-filter"
          aria-label="Filter artwork"
          value={selectedFilter}
          className={selectClassName}
          onChange={(event) => updateSearch(parseFilterValue(event.currentTarget.value))}
        >
          <option value="">All art</option>
          {(taxonomy.data?.categories ?? []).map((item) => (
            <option key={`category:${item.slug}`} value={`category:${item.slug}`}>
              {item.name}
            </option>
          ))}
          {(styles.data?.items ?? []).map((item) => (
            <option key={`style:${item.slug}`} value={`style:${item.slug}`}>
              {item.name}
            </option>
          ))}
          {(galleries.data?.items ?? []).map((item) => (
            <option key={`gallery:${item.slug}`} value={`gallery:${item.slug}`}>
              {item.name}
            </option>
          ))}
        </select>
        <SelectChevron />
      </label>

      <label className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_--spacing(8)] lg:w-auto lg:shrink-0">
        <span className="sr-only">Sort artwork</span>
        <select
          name="artwork-sort"
          aria-label="Sort artwork"
          value={search.sort ?? "recommended"}
          className={selectClassName}
          onChange={(event) => {
            const value = event.currentTarget.value;
            updateSearch({
              sort:
                value === "recent" || value === "title" || value === "artist" ? value : undefined,
            });
          }}
        >
          <option value="recommended">Recommended</option>
          <option value="recent">Newest first</option>
          <option value="title">Title A–Z</option>
          <option value="artist">Artist A–Z</option>
        </select>
        <SelectChevron />
      </label>
    </div>
  );
}
