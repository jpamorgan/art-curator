import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BrowseIndex, BrowseIndexSkeleton } from "@/components/browse-index";
import { RouteUnavailable } from "@/components/route-unavailable";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/artists/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.orpc.artists.list.queryOptions()),
  head: () => ({
    meta: [
      { title: "Artists — Art" },
      { name: "description", content: "Browse artists in the curated catalog." },
    ],
    links: [
      { rel: "canonical", href: "https://art.jpamorgan.com/artists" },
      {
        rel: "alternate",
        type: "text/markdown",
        href: "https://art.jpamorgan.com/artists.md",
      },
    ],
  }),
  pendingComponent: () => <BrowseIndexSkeleton kind="artists" />,
  errorComponent: () => (
    <RouteUnavailable title="Artists unavailable" message="Artists could not be loaded." />
  ),
  component: ArtistsIndex,
});

function ArtistsIndex() {
  const artistsQuery = useQuery(orpc.artists.list.queryOptions());

  return (
    <BrowseIndex
      kind="artists"
      items={artistsQuery.data?.items ?? []}
      isLoading={artistsQuery.isPending}
      isError={artistsQuery.isError}
      isRetrying={artistsQuery.isFetching}
      onRetry={() => void artistsQuery.refetch()}
    />
  );
}
