import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";

import FavoriteButton from "@/components/favorite-button";

export interface ArtworkCardData {
  id: string;
  slug: string;
  title: string;
  artist: string;
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
}

function getSafeAspectRatio(artwork: ArtworkCardData) {
  const dimensionsRatio = artwork.imageWidth / artwork.imageHeight;
  const ratio = Number.isFinite(artwork.aspectRatio) ? artwork.aspectRatio : dimensionsRatio;
  return Math.min(Math.max(ratio || 1, 0.45), 2.2);
}

export function ArtworkCard({ artwork, isFavorite, priority = false }: ArtworkCardProps) {
  const preferredSource = artwork.thumbnailUrl || artwork.imageUrl;
  const [imageSource, setImageSource] = useState<string | null>(preferredSource || null);
  const imageStyle = { "--artwork-aspect": getSafeAspectRatio(artwork) } as CSSProperties;
  const description = [artwork.artist, artwork.date].filter(Boolean).join(", ");

  return (
    <article className="group relative min-w-0">
      <Link
        to="/art/$slug"
        params={{ slug: artwork.slug }}
        aria-label={`View ${artwork.title} by ${artwork.artist}`}
        className="absolute inset-0 z-10 rounded-[min(1vw,12px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
      />
      <div
        className="relative overflow-hidden rounded-[min(1vw,12px)] bg-neutral-100 [aspect-ratio:var(--artwork-aspect)] outline-1 -outline-offset-1 outline-black/10"
        style={imageStyle}
      >
        {imageSource ? (
          <img
            src={imageSource}
            alt={artwork.alt}
            width={artwork.imageWidth}
            height={artwork.imageHeight}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="size-full object-cover transition-[opacity,transform] duration-300 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
            onError={() => {
              if (imageSource !== artwork.imageUrl && artwork.imageUrl) {
                setImageSource(artwork.imageUrl);
              } else {
                setImageSource(null);
              }
            }}
          />
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
          <p className="truncate text-base text-neutral-500 sm:text-sm">
            {description || artwork.gallery}
          </p>
        </div>
        {artwork.gallery ? (
          <p className="max-w-[12ch] shrink-0 truncate text-base text-neutral-400 sm:text-sm">
            {artwork.gallery}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export { getSafeAspectRatio };
