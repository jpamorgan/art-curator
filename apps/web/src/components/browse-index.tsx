import { Link } from "@tanstack/react-router";
import { useState } from "react";

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
  onRetry?: () => void;
}

function BrowseCard({ kind, item }: { kind: BrowseKind; item: BrowseIndexItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const content = (
    <>
      <div className="aspect-[4/3] overflow-hidden rounded-[min(1vw,12px)] bg-neutral-100 outline-1 -outline-offset-1 outline-black/10">
        {item.coverImageUrl && !imageFailed ? (
          <img
            src={item.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
            onError={() => setImageFailed(true)}
          />
        ) : null}
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
  onRetry,
}: BrowseIndexProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 sm:p-3 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} aria-hidden="true">
            <div className="aspect-[4/3] animate-pulse rounded-[min(1vw,12px)] bg-neutral-100 motion-reduce:animate-none" />
            <div className="flex flex-col gap-1.5 py-2">
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-base text-neutral-600 sm:text-sm">Could not load {kind}.</p>
        {onRetry ? (
          <button
            type="button"
            className="min-h-10 rounded-full bg-neutral-950 px-3 text-base text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm"
            onClick={onRetry}
          >
            Try again
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
