import type { ArtworkCardData } from "@/components/artwork-card";
import { ArtworkCard } from "@/components/artwork-card";
import { GallerySkeleton } from "@/components/gallery-skeleton";
import { useEffect, useState } from "react";

interface ColdStartPickerProps {
  artworks: ArtworkCardData[];
  favoriteIds: readonly string[];
  minimumFavoriteCount: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ColdStartPicker({
  artworks,
  favoriteIds,
  minimumFavoriteCount,
  isLoading = false,
  isError = false,
  onRetry,
}: ColdStartPickerProps) {
  const progress = Math.min(favoriteIds.length, minimumFavoriteCount);
  const [choices, setChoices] = useState<ArtworkCardData[]>([]);

  useEffect(() => {
    if (choices.length === 0 && artworks.length > 0) setChoices(artworks.slice(0, 12));
  }, [artworks, choices.length]);

  return (
    <section aria-labelledby="taste-heading" className="px-2 pb-10 sm:px-3">
      <div className="flex flex-col gap-2 py-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            id="taste-heading"
            className="max-w-[24ch] text-balance text-2xl font-medium tracking-tight"
          >
            Choose art you’d keep coming back to
          </h1>
          <p className="max-w-[62ch] text-pretty text-base text-neutral-600 sm:text-sm">
            Save at least {minimumFavoriteCount} works. We’ll use the mix—not just one choice—to
            shape your first recommendations.
          </p>
        </div>
        <p
          aria-live="polite"
          className="shrink-0 tabular-nums text-base font-medium text-neutral-950 sm:text-sm"
        >
          {progress} of {minimumFavoriteCount} saved
        </p>
      </div>

      {isLoading && choices.length === 0 ? (
        <GallerySkeleton />
      ) : isError && choices.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-pretty text-base text-neutral-600 sm:text-sm">
            Could not load artwork choices.
          </p>
          {onRetry ? (
            <button
              type="button"
              className="min-h-12 rounded-lg bg-neutral-950 px-3.5 text-base text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm lg:min-h-10"
              onClick={onRetry}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : choices.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center text-center">
          <p className="text-pretty text-base text-neutral-600 sm:text-sm">
            No artwork choices are available yet.
          </p>
        </div>
      ) : (
        <div
          role="list"
          aria-label="Choose favorite artwork"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {choices.map((artwork, index) => (
            <div key={artwork.id} role="listitem" className="min-w-0">
              <ArtworkCard
                artwork={artwork}
                isFavorite={favoriteIds.includes(artwork.id)}
                priority={index < 4}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
