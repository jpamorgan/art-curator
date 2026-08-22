import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BrowseIndex, BrowseIndexSkeleton } from "@/components/browse-index";
import { RouteUnavailable } from "@/components/route-unavailable";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/styles/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.orpc.styles.list.queryOptions()),
  head: () => ({
    meta: [{ title: "Styles — Art" }, { name: "description", content: "Browse art by style." }],
    links: [
      { rel: "canonical", href: "https://art.jpamorgan.com/styles" },
      {
        rel: "alternate",
        type: "text/markdown",
        href: "https://art.jpamorgan.com/styles.md",
      },
    ],
  }),
  pendingComponent: () => <BrowseIndexSkeleton kind="styles" />,
  errorComponent: () => (
    <RouteUnavailable title="Styles unavailable" message="Styles could not be loaded." />
  ),
  component: StylesIndex,
});

function StylesIndex() {
  const stylesQuery = useQuery(orpc.styles.list.queryOptions());

  return (
    <BrowseIndex
      kind="styles"
      items={stylesQuery.data?.items ?? []}
      isLoading={stylesQuery.isPending}
      isError={stylesQuery.isError}
      isRetrying={stylesQuery.isFetching}
      onRetry={() => void stylesQuery.refetch()}
    />
  );
}
