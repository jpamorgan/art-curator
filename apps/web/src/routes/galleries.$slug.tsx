import { createFileRoute, notFound } from "@tanstack/react-router";

import {
  FilteredGalleryPage,
  FilteredGalleryPageSkeleton,
  FilteredGalleryRouteState,
  getFilteredArtworkListInput,
} from "@/components/filtered-gallery-page";
import { loadBrowseRouteData } from "@/lib/browse-route-data";

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

export const Route = createFileRoute("/galleries/$slug")({
  validateSearch: parseSortSearch,
  loaderDeps: ({ search }) => ({ sort: search.sort ?? "recent" }),
  loader: async ({ context, deps, params }) => {
    const data = await loadBrowseRouteData(
      () =>
        context.queryClient.ensureQueryData(
          context.orpc.galleries.bySlug.queryOptions({ input: { slug: params.slug } }),
        ),
      () =>
        context.queryClient.ensureInfiniteQueryData(
          context.orpc.artworks.list.infiniteOptions({
            input: getFilteredArtworkListInput("gallery", params.slug, deps.sort),
            initialPageParam: undefined,
            getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          }),
        ),
    );
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const gallery = loaderData?.gallery;
    if (!gallery) {
      return {
        meta: [
          { title: "Gallery — Art" },
          { name: "description", content: "Browse art by gallery." },
        ],
      };
    }

    const title = `${gallery.name} — Art`;
    const description = gallery.description || `Browse artwork from ${gallery.name}.`;

    return {
      meta: [{ title }, { name: "description", content: description }],
      links: [{ rel: "canonical", href: `https://art.jpamorgan.com/galleries/${gallery.slug}` }],
    };
  },
  pendingComponent: () => <FilteredGalleryPageSkeleton filter="gallery" />,
  errorComponent: () => <FilteredGalleryRouteState kind="gallery" status="error" />,
  notFoundComponent: () => <FilteredGalleryRouteState kind="gallery" status="not-found" />,
  component: GalleryRoute,
});

function GalleryRoute() {
  const { slug } = Route.useParams();
  const { sort } = Route.useSearch();
  const { gallery } = Route.useLoaderData();

  return (
    <FilteredGalleryPage
      filter="gallery"
      slug={slug}
      entityId={gallery.id}
      initialIsFollowing={gallery.isFollowing}
      sort={sort}
      title={gallery.name}
      subtitle={gallery.location}
    />
  );
}
