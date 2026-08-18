import { Skeleton } from "@art/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { PendingButtonLabel } from "@/components/pending-button-label";

type BrowseKind = "galleries" | "styles";

export interface BrowseIndexItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  artworkCount: number;
  coverImageUrl: string | null;
  location?: string;
}

interface BrowseIndexProps {
  kind: BrowseKind;
  items: BrowseIndexItem[];
  isLoading?: boolean;
  isError?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
}

function BrowseCard({ kind, item }: { kind: BrowseKind; item: BrowseIndexItem }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">(
    item.coverImageUrl ? "loading" : "failed",
  );
  const hideImage = isHydrated && imageState === "loading";

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    setImageState(image.naturalWidth > 0 ? "loaded" : "failed");
  }, [item.coverImageUrl]);

  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[min(1vw,12px)] bg-neutral-100 outline-1 -outline-offset-1 outline-black/10">
        {item.coverImageUrl && imageState !== "failed" ? (
          <>
            {imageState === "loading" ? (
              <Skeleton className="absolute inset-0 rounded-none bg-neutral-100" />
            ) : null}
            <img
              ref={imageRef}
              src={item.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className={`relative z-[1] size-full object-cover transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${hideImage ? "scale-[1.01] opacity-0" : "scale-100 opacity-100 group-hover:scale-[1.015]"}`}
              onLoad={() => setImageState("loaded")}
              onError={() => setImageState("failed")}
            />
          </>
        ) : (
          <div className="flex size-full items-center justify-center p-4 text-center text-base text-neutral-400 sm:text-sm">
            Image unavailable
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-start justify-between gap-3 px-0.5 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium text-neutral-950 sm:text-sm">
            {item.name}
          </h2>
          {item.location ? (
            <p className="truncate text-base text-neutral-500 sm:text-sm">{item.location}</p>
          ) : null}
        </div>
        <p className="shrink-0 tabular-nums text-base text-neutral-400 sm:text-sm">
          {item.artworkCount}
        </p>
      </div>
    </>
  );

  return kind === "galleries" ? (
    <Link
      to="/galleries/$slug"
      params={{ slug: item.slug }}
      className="group min-w-0 rounded-[min(1vw,12px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    >
      {content}
    </Link>
  ) : (
    <Link
      to="/styles/$slug"
      params={{ slug: item.slug }}
      className="group min-w-0 rounded-[min(1vw,12px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    >
      {content}
    </Link>
  );
}

export function BrowseIndex({
  kind,
  items,
  isLoading = false,
  isError = false,
  isRetrying = false,
  onRetry,
}: BrowseIndexProps) {
  if (isLoading) {
    return <BrowseIndexSkeleton kind={kind} />;
  }

  if (isError && items.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-base text-neutral-600 sm:text-sm">Could not load {kind}.</p>
        {onRetry ? (
          <button
            type="button"
            aria-busy={isRetrying}
            className="min-h-10 min-w-24 rounded-lg bg-neutral-950 px-3.5 text-base text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-wait disabled:opacity-70 sm:text-sm"
            disabled={isRetrying}
            onClick={onRetry}
          >
            <PendingButtonLabel idle="Try again" pending="Retrying…" isPending={isRetrying} />
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    const heading = kind === "galleries" ? "Galleries" : "Styles";
    const message = kind === "galleries" ? "No galleries yet." : "No styles yet.";

    return (
      <section
        aria-labelledby="browse-heading"
        className="flex min-h-64 items-center justify-center px-4 text-center"
      >
        <h1 id="browse-heading" className="sr-only">
          {heading}
        </h1>
        <p className="text-base text-neutral-500 sm:text-sm">{message}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="browse-heading" className="p-2 sm:p-3">
      <h1 id="browse-heading" className="sr-only">
        {kind === "galleries" ? "Galleries" : "Styles"}
      </h1>
      <div
        role="list"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      >
        {items.map((item) => (
          <div key={item.id} role="listitem" className="min-w-0">
            <BrowseCard kind={kind} item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function BrowseIndexSkeleton({ kind }: { kind: BrowseKind }) {
  const heading = kind === "galleries" ? "galleries" : "styles";

  return (
    <section aria-busy="true" aria-live="polite" role="status" className="p-2 sm:p-3">
      <span className="sr-only">Loading {heading}</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} aria-hidden="true" className="min-w-0">
            <Skeleton className="aspect-[4/3] rounded-[min(1vw,12px)] bg-neutral-100 outline-1 -outline-offset-1 outline-black/5" />
            <div className="flex min-w-0 items-start justify-between gap-3 px-0.5 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/2 rounded-full bg-neutral-100" />
                {kind === "galleries" ? (
                  <Skeleton className="h-4 w-1/3 rounded-full bg-neutral-100" />
                ) : null}
              </div>
              <Skeleton className="h-4 w-6 shrink-0 rounded-full bg-neutral-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
