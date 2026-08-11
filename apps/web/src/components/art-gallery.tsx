import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { ArtworkCard, getSafeAspectRatio, type ArtworkCardData } from "@/components/artwork-card";
import { GallerySkeleton } from "@/components/gallery-skeleton";
import { PendingButtonLabel } from "@/components/pending-button-label";
import {
  GALLERY_GAP,
  GALLERY_GRID_CLASS_NAME,
  getGalleryColumnCount,
  getGalleryItemWidth,
} from "@/lib/gallery-layout";

export type { ArtworkCardData } from "@/components/artwork-card";

export interface ArtGalleryProps {
  items: ArtworkCardData[];
  favoriteIds?: readonly string[];
  isLoading?: boolean;
  isError?: boolean;
  isRetrying?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  hasNextPage?: boolean;
  fetchNextPage?: () => void | Promise<unknown>;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  emptyMessage?: string;
}

function StaticGallery({ items, favoriteIds }: Pick<ArtGalleryProps, "items" | "favoriteIds">) {
  return (
    <div className={GALLERY_GRID_CLASS_NAME}>
      {items.slice(0, 15).map((artwork, index) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          isFavorite={favoriteIds?.includes(artwork.id)}
          priority={index < 5}
        />
      ))}
    </div>
  );
}

export function ArtGallery({
  items,
  favoriteIds,
  isLoading = false,
  isError = false,
  isRetrying = false,
  errorMessage = "The gallery could not be loaded.",
  onRetry,
  hasNextPage = false,
  fetchNextPage,
  isFetchingNextPage = false,
  isFetchNextPageError = false,
  emptyMessage = "No artwork found.",
}: ArtGalleryProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const columns = getGalleryColumnCount(containerWidth || 320);
  const itemWidth = getGalleryItemWidth(containerWidth || 320);
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    lanes: columns,
    gap: GALLERY_GAP,
    overscan: columns * 3,
    scrollMargin,
    getItemKey: (index) => items[index]?.id ?? index,
    estimateSize: (index) => {
      const artwork = items[index];
      return artwork ? itemWidth / getSafeAspectRatio(artwork) + 58 : itemWidth + 58;
    },
    enabled: isMounted && containerWidth > 0,
  });

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!containerElement) return;

    const measure = () => {
      setContainerWidth(containerElement.clientWidth);
      setScrollMargin(containerElement.getBoundingClientRect().top + window.scrollY);
    };
    const resizeObserver = new ResizeObserver(measure);

    measure();
    resizeObserver.observe(containerElement);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerElement]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || !fetchNextPage || isFetchingNextPage || isFetchNextPageError) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage, items.length]);

  if (isLoading) {
    return (
      <div className="@container px-2 py-2 sm:px-3">
        <GallerySkeleton />
      </div>
    );
  }

  if (isError && items.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">{errorMessage}</p>
        {onRetry ? (
          <button
            type="button"
            aria-busy={isRetrying}
            className="min-h-10 min-w-24 rounded-full bg-neutral-950 px-3 text-base text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-wait disabled:opacity-70 sm:text-sm"
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
    return (
      <div className="flex min-h-64 items-center justify-center px-4 text-center">
        <p className="text-pretty text-base text-neutral-500 sm:text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const galleryStyle = {
    "--gallery-height": `${virtualizer.getTotalSize()}px`,
  } as CSSProperties;

  return (
    <div className="@container px-2 pt-2 pb-8 sm:px-3" aria-busy={isFetchingNextPage}>
      <div ref={setContainerElement} className="min-w-0">
        {!isMounted || containerWidth === 0 ? (
          <StaticGallery items={items} favoriteIds={favoriteIds} />
        ) : (
          <div
            role="list"
            aria-label="Artwork"
            className="relative [height:var(--gallery-height)]"
            style={galleryStyle}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const artwork = items[virtualItem.index];
              if (!artwork) return null;

              const cardStyle = {
                "--gallery-x": `${virtualItem.lane * (itemWidth + GALLERY_GAP)}px`,
                "--gallery-y": `${virtualItem.start - scrollMargin}px`,
                "--gallery-width": `${itemWidth}px`,
              } as CSSProperties;

              return (
                <div
                  key={virtualItem.key}
                  role="listitem"
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 [transform:translate3d(var(--gallery-x),var(--gallery-y),0)] [width:var(--gallery-width)]"
                  style={cardStyle}
                >
                  <ArtworkCard
                    artwork={artwork}
                    isFavorite={favoriteIds ? favoriteIdSet.has(artwork.id) : artwork.isFavorite}
                    priority={virtualItem.index < columns}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div ref={loadMoreRef} className="min-h-1">
        {isFetchingNextPage ? (
          <div className="pt-3">
            <GallerySkeleton count={columns} label="Loading more artwork" />
          </div>
        ) : null}
        {isFetchNextPageError && fetchNextPage && !isFetchingNextPage ? (
          <div className="flex justify-center py-6">
            <button
              type="button"
              className="min-h-10 rounded-full bg-neutral-100 px-3 text-base text-neutral-800 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm"
              disabled={isFetchingNextPage}
              onClick={() => {
                if (!isFetchingNextPage) void fetchNextPage();
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
