import { Skeleton } from "@art/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import FavoriteButton from "@/components/favorite-button";
import type { RecommendationReason } from "@/lib/discovery";

export interface ArtworkCardData {
  id: string;
  slug: string;
  title: string;
  artist: string;
  artistSlug: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  imageWidth: number;
  imageHeight: number;
  aspectRatio: number;
  alt: string;
  gallery: string;
  gallerySlug: string;
  category: string;
  styles: { slug: string; name: string }[];
  isFavorite: boolean;
}

interface ArtworkCardProps {
  artwork: ArtworkCardData;
  isFavorite?: boolean;
  priority?: boolean;
  recommendationReason?: RecommendationReason;
  onNotForMe?: (artwork: ArtworkCardData) => void;
  onImpression?: (artwork: ArtworkCardData) => void;
  onOpen?: (artwork: ArtworkCardData) => void;
}

function getSafeAspectRatio(artwork: ArtworkCardData) {
  const dimensionsRatio = artwork.imageWidth / artwork.imageHeight;
  const ratio = Number.isFinite(artwork.aspectRatio) ? artwork.aspectRatio : dimensionsRatio;
  return Math.min(Math.max(ratio || 1, 0.45), 2.2);
}

export function ArtworkCard({
  artwork,
  isFavorite,
  priority = false,
  recommendationReason,
  onNotForMe,
  onImpression,
  onOpen,
}: ArtworkCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const preferredSource = artwork.thumbnailUrl || artwork.imageUrl;
  const imageRef = useRef<HTMLImageElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [imageSource, setImageSource] = useState<string | null>(preferredSource || null);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">(
    preferredSource ? "loading" : "failed",
  );
  const imageStyle = { "--artwork-aspect": getSafeAspectRatio(artwork) } as CSSProperties;
  const description = [artwork.artist, artwork.date].filter(Boolean).join(", ");
  const hideImage = isHydrated && imageState === "loading";

  const handleImageFailure = useCallback(() => {
    if (imageSource !== artwork.imageUrl && artwork.imageUrl) {
      setImageState("loading");
      setImageSource(artwork.imageUrl);
      return;
    }
    setImageState("failed");
    setImageSource(null);
  }, [artwork.imageUrl, imageSource]);

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    const target = articleRef.current;
    if (!target || !onImpression) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onImpression(artwork);
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [artwork, onImpression]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) {
      setImageState("loaded");
    } else {
      handleImageFailure();
    }
  }, [handleImageFailure, imageSource]);

  return (
    <article ref={articleRef} className="group relative min-w-0">
      <Link
        to="/art/$slug"
        params={{ slug: artwork.slug }}
        aria-label={`View ${artwork.title} by ${artwork.artist}`}
        className="absolute inset-0 z-10 rounded-[min(1vw,12px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
        onClick={() => onOpen?.(artwork)}
      />
      <div
        className="relative overflow-hidden rounded-[min(1vw,12px)] bg-neutral-100 [aspect-ratio:var(--artwork-aspect)] outline-1 -outline-offset-1 outline-black/10"
        style={imageStyle}
      >
        {imageSource ? (
          <>
            {imageState === "loading" ? (
              <Skeleton className="absolute inset-0 rounded-none bg-neutral-100" />
            ) : null}
            <img
              key={imageSource}
              ref={imageRef}
              src={imageSource}
              alt={artwork.alt}
              width={artwork.imageWidth}
              height={artwork.imageHeight}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className={`relative z-[1] size-full object-cover transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${hideImage ? "scale-[1.01] opacity-0" : "scale-100 opacity-100 group-hover:scale-[1.015]"}`}
              onLoad={() => setImageState("loaded")}
              onError={handleImageFailure}
            />
          </>
        ) : (
          <div className="flex size-full items-center justify-center p-4 text-center text-base text-neutral-500 sm:text-sm">
            Image unavailable
          </div>
        )}
        <div className="absolute top-2 right-2 z-20">
          <FavoriteButton
            artworkId={artwork.id}
            initialIsFavorite={isFavorite ?? artwork.isFavorite}
            className="bg-white/92 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="flex min-w-0 items-start justify-between gap-2 px-0.5 pt-2 pb-1">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium text-neutral-950 sm:text-sm">
            {artwork.title}
          </h2>
          <p className="relative z-20 truncate text-base text-neutral-500 sm:text-sm">
            {artwork.artistSlug ? (
              <Link
                to="/artists/$slug"
                params={{ slug: artwork.artistSlug }}
                className="rounded-sm hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950"
              >
                {description || artwork.gallery}
              </Link>
            ) : (
              description || artwork.gallery
            )}
          </p>
        </div>
        {artwork.gallery ? (
          <p className="max-w-[12ch] shrink-0 truncate text-base text-neutral-400 sm:text-sm">
            {artwork.gallery}
          </p>
        ) : null}
      </div>
      {recommendationReason ? (
        <div className="relative z-20 flex min-w-0 items-center justify-between gap-2 px-0.5 pb-2">
          <p className="min-w-0 truncate text-base text-neutral-500 sm:text-sm">
            {recommendationReason.label}
          </p>
          {onNotForMe ? (
            <button
              type="button"
              className="relative inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-base text-neutral-500 transition-transform duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] sm:h-8 sm:text-sm"
              onClick={() => onNotForMe(artwork)}
            >
              <span
                className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                aria-hidden="true"
              />
              <X aria-hidden="true" className="size-4 shrink-0 stroke-neutral-500" />
              Not for me
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export { getSafeAspectRatio };
