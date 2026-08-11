import type { ArtworkCard } from "@art/api/art-contract";
import { Skeleton } from "@art/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { ArtGallery } from "@/components/art-gallery";
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

type ArtworkImageData = Pick<
  ArtworkCard,
  "alt" | "imageHeight" | "imageUrl" | "imageWidth" | "thumbnailUrl"
>;

function ArtworkImage({ artwork }: { artwork: ArtworkImageData }) {
  const [phase, setPhase] = useState<"full" | "thumbnail" | "unavailable">("full");
  const [isLoaded, setIsLoaded] = useState(false);
  const source =
    phase === "full" ? artwork.imageUrl : phase === "thumbnail" ? artwork.thumbnailUrl : null;
  const viewportConstrainedWidth = `min(100%, calc((100dvh - 7rem) * ${artwork.imageWidth / artwork.imageHeight}))`;

  return (
    <div
      className="relative w-full max-h-[calc(100dvh-7rem)] max-w-full overflow-hidden rounded-[min(1vw,10px)] bg-neutral-100 shadow-sm outline-1 -outline-offset-1 outline-black/10"
      style={{
        aspectRatio: `${artwork.imageWidth} / ${artwork.imageHeight}`,
        maxWidth: viewportConstrainedWidth,
      }}
    >
      {source ? (
        <>
          {!isLoaded && (
            <Skeleton className="absolute inset-0 size-full rounded-none bg-neutral-200" />
          )}
          <img
            key={source}
            src={source}
            alt={artwork.alt}
            width={artwork.imageWidth}
            height={artwork.imageHeight}
            className={`absolute inset-0 size-full object-contain transition-opacity duration-150 motion-reduce:transition-none ${isLoaded ? "opacity-100" : "opacity-0"}`}
            decoding="async"
            fetchPriority="high"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setIsLoaded(false);
              if (phase === "full" && artwork.thumbnailUrl !== artwork.imageUrl) {
                setPhase("thumbnail");
                return;
              }
              setPhase("unavailable");
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-6 text-center text-base text-neutral-500 sm:text-sm"
          role="status"
        >
          Image unavailable
        </div>
      )}
    </div>
  );
}

function ArtworkDetailPage() {
  const { artwork, related } = Route.useLoaderData();
  const gallery = normalizeNamedLink({ name: artwork.gallery, slug: artwork.gallerySlug });
  const styles = normalizeNamedLinks(artwork.styles);
  const categories = normalizeNamedLinks(artwork.categories);

  return (
    <div className="isolate bg-white text-neutral-950">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-h-[50dvh] min-w-0 items-center justify-center bg-neutral-50 p-3 sm:p-6 lg:min-h-[calc(100dvh-4rem)] lg:p-10">
          <ArtworkImage key={artwork.id} artwork={artwork} />
        </div>

        <aside className="min-w-0 p-5 sm:p-8 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto">
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
                className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-neutral-100 py-2 pr-3 pl-2 text-base font-medium text-neutral-950 outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:min-h-8 sm:text-sm"
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
                className="inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-neutral-100 py-2 pr-3 pl-2 text-base font-medium text-neutral-950 outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:min-h-8 sm:text-sm"
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
    <div className="isolate grid min-h-[calc(100dvh-4rem)] bg-white lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex items-center justify-center bg-neutral-50 p-3 sm:p-6 lg:p-10">
        <Skeleton className="aspect-[4/5] max-h-[calc(100dvh-7rem)] w-full max-w-3xl rounded-[min(1vw,10px)] bg-neutral-200" />
      </div>
      <div
        className="flex flex-col gap-7 p-5 sm:p-8"
        role="status"
        aria-label="Loading artwork details"
      >
        <div className="flex justify-between">
          <Skeleton className="size-12 rounded-full bg-neutral-100 sm:pointer-fine:size-10" />
          <Skeleton className="h-12 w-24 rounded-full bg-neutral-100 sm:pointer-fine:h-10" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-4/5 rounded-md bg-neutral-100" />
          <Skeleton className="h-5 w-2/5 rounded-md bg-neutral-100" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-md bg-neutral-100" />
          <Skeleton className="h-4 w-11/12 rounded-md bg-neutral-100" />
          <Skeleton className="h-4 w-3/4 rounded-md bg-neutral-100" />
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
          className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-3 text-base font-medium text-white outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:min-h-8 sm:text-sm"
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
          className="inline-flex min-h-10 items-center rounded-full bg-neutral-950 px-3 text-base font-medium text-white outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:min-h-8 sm:text-sm"
        >
          Browse art
        </Link>
      </div>
    </div>
  );
}
