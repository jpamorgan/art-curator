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

function parseSortSearch(search: Record<string, unknown>): { sort?: SortOrder } {
  const sort = SORT_OPTIONS.includes(search.sort as SortOrder)
    ? (search.sort as SortOrder)
    : undefined;
  return sort ? { sort } : {};
}

export const Route = createFileRoute("/artists/$slug")({
  validateSearch: parseSortSearch,
  loaderDeps: ({ search }) => ({ sort: search.sort ?? "recent" }),
  loader: async ({ context, deps, params }) => {
    const data = await loadBrowseRouteData(
      () =>
        context.queryClient.ensureQueryData(
          context.orpc.artists.bySlug.queryOptions({ input: { slug: params.slug } }),
        ),
      () =>
        context.queryClient.ensureInfiniteQueryData(
          context.orpc.artworks.list.infiniteOptions({
            input: getFilteredArtworkListInput("artist", params.slug, deps.sort),
            initialPageParam: undefined,
            getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          }),
        ),
    );
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const artist = loaderData?.artist;
    return {
      meta: [
        { title: artist ? `${artist.name} — Art` : "Artist — Art" },
        {
          name: "description",
          content: artist?.description || "Browse artwork by this artist.",
        },
      ],
      links: artistLinks(params.slug),
    };
  },
  pendingComponent: () => <FilteredGalleryPageSkeleton filter="artist" />,
  errorComponent: () => <FilteredGalleryRouteState kind="artist" status="error" />,
  notFoundComponent: () => <FilteredGalleryRouteState kind="artist" status="not-found" />,
  component: ArtistRoute,
});

function artistLinks(slug: string) {
  return [
    { rel: "canonical", href: `https://art.jpamorgan.com/artists/${slug}` },
    {
      rel: "alternate",
      type: "text/markdown",
      href: `https://art.jpamorgan.com/artists/${slug}.md`,
    },
  ];
}

function ArtistRoute() {
  const { slug } = Route.useParams();
  const { sort } = Route.useSearch();
  const { artist } = Route.useLoaderData();

  return (
    <FilteredGalleryPage
      filter="artist"
      slug={slug}
      entityId={artist.id}
      initialIsFollowing={artist.isFollowing}
      sort={sort}
      title={artist.name}
    />
  );
}
