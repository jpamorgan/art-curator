import { createFileRoute, notFound } from "@tanstack/react-router";

import {
  FilteredGalleryPage,
  FilteredGalleryPageSkeleton,
  FilteredGalleryRouteState,
  getFilteredArtworkListInput,
} from "@/components/filtered-gallery-page";
import { loadValidatedBrowseData } from "@/lib/browse-route-data";

const SORT_OPTIONS = ["recent", "title", "artist"] as const;
type SortOrder = (typeof SORT_OPTIONS)[number];

interface SortSearch {
  sort?: SortOrder;
}

function parseSortSearch(search: Record<string, unknown>): SortSearch {
  const sort = SORT_OPTIONS.includes(search.sort as SortOrder)
    ? (search.sort as SortOrder)
    : undefined;
  return sort ? { sort } : {};
}

export const Route = createFileRoute("/styles/$slug")({
  validateSearch: parseSortSearch,
  loaderDeps: ({ search }) => ({ sort: search.sort ?? "recent" }),
  loader: async ({ context, deps, params }) => {
    const data = await loadValidatedBrowseData(() =>
      context.queryClient.ensureQueryData(
        context.orpc.styles.bySlug.queryOptions({ input: { slug: params.slug } }),
      ),
    );
    if (!data) throw notFound();
    await context.queryClient.ensureInfiniteQueryData(
      context.orpc.artworks.list.infiniteOptions({
        input: getFilteredArtworkListInput("style", params.slug, deps.sort),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }),
    );
    return data;
  },
  head: ({ loaderData }) => {
    const style = loaderData?.style;
    if (!style) {
      return {
        meta: [{ title: "Style — Art" }, { name: "description", content: "Browse art by style." }],
      };
    }

    const title = `${style.name} — Art`;
    const description = style.description || `Browse ${style.name} artwork.`;

    return {
      meta: [{ title }, { name: "description", content: description }],
      links: [{ rel: "canonical", href: `https://art.jpamorgan.com/styles/${style.slug}` }],
    };
  },
  pendingComponent: FilteredGalleryPageSkeleton,
  errorComponent: () => <FilteredGalleryRouteState kind="style" status="error" />,
  notFoundComponent: () => <FilteredGalleryRouteState kind="style" status="not-found" />,
  component: StyleRoute,
});

function StyleRoute() {
  const { slug } = Route.useParams();
  const { sort } = Route.useSearch();
  const { style } = Route.useLoaderData();

  return <FilteredGalleryPage filter="style" slug={slug} sort={sort} title={style.name} />;
}
