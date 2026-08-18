import { Skeleton } from "@art/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { ArtGallery } from "@/components/art-gallery";
import { ArtworkImage } from "@/components/artwork-image";
import FavoriteButton from "@/components/favorite-button";
import { loadArtworkRouteData } from "@/lib/artwork-route-data";

export const Route = createFileRoute("/art/$slug")({
  loader: ({ context, params }) =>
    loadArtworkRouteData(() =>
      context.queryClient.ensureQueryData(
        context.orpc.artworks.bySlug.queryOptions({ input: { slug: params.slug } }),
      ),
    ),
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Artwork — Art" }],
      };
    }

    const title = `${loaderData.artwork.title} by ${loaderData.artwork.artist} — Art`;
    const description = loaderData.artwork.description.slice(0, 160);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: loaderData.artwork.imageUrl },
        { property: "og:type", content: "article" },
      ],
      links: [{ rel: "canonical", href: `https://art.jpamorgan.com/art/${params.slug}` }],
    };
  },
  pendingComponent: ArtworkDetailSkeleton,
  errorComponent: ArtworkDetailError,
  notFoundComponent: ArtworkDetailNotFound,
  component: ArtworkDetailPage,
});

type NamedLink = {
  name: string;
  slug?: string;
};

function normalizeNamedLink(value: unknown): NamedLink | null {
  if (typeof value === "string") return { name: value };
  if (!value || typeof value !== "object" || !("name" in value)) return null;
  if (typeof value.name !== "string") return null;

  return {
    name: value.name,
    slug: "slug" in value && typeof value.slug === "string" ? value.slug : undefined,
  };
}

function normalizeNamedLinks(value: unknown): NamedLink[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeNamedLink).filter((item): item is NamedLink => item !== null);
}

function ArtworkDetailPage() {
  const { artwork, related } = Route.useLoaderData();
  const gallery = normalizeNamedLink({ name: artwork.gallery, slug: artwork.gallerySlug });
  const styles = normalizeNamedLinks(artwork.styles);
  const categories = normalizeNamedLinks(artwork.categories);

  return (
    <div className="isolate bg-white text-neutral-950">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-h-[50dvh] min-w-0 items-center justify-center bg-neutral-50 p-3 sm:p-6 lg:min-h-[calc(100dvh-3.5rem)] lg:p-10">
          <ArtworkImage key={artwork.id} artwork={artwork} />
        </div>

        <aside className="min-w-0 p-5 sm:p-8 lg:sticky lg:top-14 lg:max-h-[calc(100dvh-3.5rem)] lg:self-start lg:overflow-y-auto">
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4">
              <Link
                to="/"
                aria-label="Back to discover"
                className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:pointer-fine:size-10"
              >
                <ArrowLeft className="size-4 shrink-0 stroke-neutral-950" aria-hidden="true" />
              </Link>
              <FavoriteButton
                artworkId={artwork.id}
                initialIsFavorite={artwork.isFavorite}
                returnTo={`/art/${artwork.slug}`}
                showLabel
              />
            </div>

            <div className="flex flex-col gap-3">
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Categories">
                  {categories.map((category) =>
                    category.slug ? (
                      <Link
                        key={category.slug}
                        to="/"
                        search={{ category: category.slug }}
                        className="rounded-full bg-neutral-100 px-3 py-1.5 text-base text-neutral-700 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
                      >
                        {category.name}
                      </Link>
                    ) : (
                      <span
                        key={category.name}
                        className="rounded-full bg-neutral-100 px-3 py-1.5 text-neutral-700"
                      >
                        {category.name}
                      </span>
                    ),
                  )}
                </div>
              )}
              <h1 className="max-w-[22ch] text-balance text-3xl font-medium tracking-tight">
                {artwork.title}
              </h1>
              <p className="text-pretty text-base text-neutral-600 sm:text-sm">
                {artwork.artist}
                {artwork.date ? `, ${artwork.date}` : ""}
              </p>
            </div>

            {artwork.description && (
              <p className="max-w-[62ch] text-pretty text-base text-neutral-700 sm:text-sm">
                {artwork.description}
              </p>
            )}

            <dl className="divide-y divide-black/10 border-y border-black/10">
              {artwork.medium && <MetadataRow term="Medium" detail={artwork.medium} />}
              {artwork.dimensions && <MetadataRow term="Dimensions" detail={artwork.dimensions} />}
              {gallery && (
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3 text-base sm:text-sm">
                  <dt className="font-medium text-neutral-950">Gallery</dt>
                  <dd className="min-w-0 text-right text-neutral-600">
                    {gallery.slug ? (
                      <Link
                        to="/galleries/$slug"
                        params={{ slug: gallery.slug }}
                        className="text-neutral-950 underline decoration-neutral-300 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                      >
                        {gallery.name}
                      </Link>
                    ) : artwork.galleryUrl ? (
                      <a
                        href={artwork.galleryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-950 underline decoration-neutral-300 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                      >
                        {gallery.name}
                      </a>
                    ) : (
                      gallery.name
                    )}
                  </dd>
                </div>
              )}
              {artwork.creditLine && <MetadataRow term="Credit" detail={artwork.creditLine} />}
            </dl>

            {styles.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-medium sm:text-sm">Styles</h2>
                <div className="flex flex-wrap gap-2" aria-label="Artwork styles">
                  {styles.map((style) =>
                    style.slug ? (
                      <Link
                        key={style.slug}
                        to="/styles/$slug"
                        params={{ slug: style.slug }}
                        className="rounded-full bg-neutral-100 px-3 py-1.5 text-base text-neutral-700 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
                      >
                        {style.name}
                      </Link>
                    ) : (
                      <span
                        key={style.name}
                        className="rounded-full bg-neutral-100 px-3 py-1.5 text-neutral-700"
                      >
                        {style.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <a
                href={artwork.source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg bg-neutral-100 py-2 pr-3.5 pl-3 text-base font-medium text-neutral-950 transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
              >
                <ArrowUpRight className="size-4 shrink-0 stroke-neutral-950" aria-hidden="true" />
                {artwork.source.name}
              </a>
              {artwork.source.attribution && (
                <p className="text-pretty text-base text-neutral-500 sm:text-sm">
                  {artwork.source.attribution}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={artwork.imageSource.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg bg-neutral-100 py-2 pr-3.5 pl-3 text-base font-medium text-neutral-950 transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
              >
                <ArrowUpRight className="size-4 shrink-0 stroke-neutral-950" aria-hidden="true" />
                Image source
              </a>
              {artwork.imageSource.attribution && (
                <p className="text-pretty text-base text-neutral-500 sm:text-sm">
                  {artwork.imageSource.attribution}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="border-t border-black/10 py-10 sm:py-14" aria-labelledby="related-art">
          <div className="flex flex-col gap-6 px-3 sm:px-5">
            <h2
              id="related-art"
              className="text-balance text-2xl font-medium tracking-tight sm:text-xl"
            >
              Related art
            </h2>
            <ArtGallery items={related} />
          </div>
        </section>
      )}
    </div>
  );
}

function MetadataRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-3 text-base sm:text-sm">
      <dt className="font-medium text-neutral-950">{term}</dt>
      <dd className="min-w-0 text-right text-neutral-600">{detail}</dd>
    </div>
  );
}

function ArtworkDetailSkeleton() {
  return (
    <div
      className="isolate grid min-h-[calc(100dvh-7rem)] bg-white lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading artwork details</span>
      <div className="min-h-[50dvh] overflow-hidden bg-neutral-50 lg:min-h-[calc(100dvh-3.5rem)]">
        <Skeleton className="size-full min-h-[50dvh] rounded-none bg-neutral-100 lg:min-h-[calc(100dvh-3.5rem)]" />
      </div>
      <div className="flex flex-col gap-8 p-5 sm:p-8">
        <div className="flex justify-between">
          <Skeleton className="size-12 rounded-full bg-neutral-100 sm:pointer-fine:size-10" />
          <Skeleton className="h-12 w-28 rounded-lg bg-neutral-100 sm:pointer-fine:h-10" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full bg-neutral-100" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-4/5 rounded-md bg-neutral-100" />
          <Skeleton className="h-5 w-2/5 rounded-md bg-neutral-100" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-md bg-neutral-100" />
          <Skeleton className="h-4 w-11/12 rounded-md bg-neutral-100" />
          <Skeleton className="h-4 w-3/4 rounded-md bg-neutral-100" />
        </div>
        <div className="flex flex-col divide-y divide-black/5 border-y border-black/5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 py-3">
              <Skeleton className="h-4 w-16 rounded-full bg-neutral-100" />
              <Skeleton className="h-4 w-28 rounded-full bg-neutral-100" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-12 rounded-full bg-neutral-100" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-full bg-neutral-100" />
            <Skeleton className="h-8 w-20 rounded-full bg-neutral-100" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-36 rounded-lg bg-neutral-100" />
          <Skeleton className="h-4 w-4/5 rounded-full bg-neutral-100" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-32 rounded-lg bg-neutral-100" />
          <Skeleton className="h-4 w-3/4 rounded-full bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}

function ArtworkDetailError() {
  return (
    <div className="isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-white p-6 text-neutral-950">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight">Artwork unavailable</h1>
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">
          This piece may have moved or is temporarily unavailable.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
        >
          Browse art
        </Link>
      </div>
    </div>
  );
}

function ArtworkDetailNotFound() {
  return (
    <div className="isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-white p-6 text-neutral-950">
      <div className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight">Artwork not found</h1>
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
        >
          Browse art
        </Link>
      </div>
    </div>
  );
}
