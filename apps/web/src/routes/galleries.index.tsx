import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BrowseIndex } from "@/components/browse-index";
import { RouteUnavailable } from "@/components/route-unavailable";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/galleries/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.orpc.galleries.list.queryOptions()),
  head: () => ({
    meta: [
      { title: "Galleries — Art" },
      { name: "description", content: "Browse art by gallery." },
    ],
    links: [{ rel: "canonical", href: "https://art.jpamorgan.com/galleries" }],
  }),
  errorComponent: () => (
    <RouteUnavailable title="Galleries unavailable" message="Galleries could not be loaded." />
  ),
  component: GalleriesIndex,
});

function GalleriesIndex() {
  const galleriesQuery = useQuery(orpc.galleries.list.queryOptions());

  return (
    <BrowseIndex
      kind="galleries"
      items={galleriesQuery.data?.items ?? []}
      isLoading={galleriesQuery.isPending}
      isError={galleriesQuery.isError}
      onRetry={() => void galleriesQuery.refetch()}
    />
  );
}
