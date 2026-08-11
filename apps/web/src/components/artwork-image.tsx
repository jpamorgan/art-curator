import type { ArtworkCard } from "@art/api/art-contract";
import { Skeleton } from "@art/ui/components/skeleton";
import { useEffect, useRef, useState } from "react";

export type ArtworkImageData = Pick<
  ArtworkCard,
  "alt" | "imageHeight" | "imageUrl" | "imageWidth" | "thumbnailUrl"
>;

type ImageState = "loading" | "loaded" | "failed";

function readImageState(image: HTMLImageElement | null): ImageState | null {
  if (!image?.complete) return null;
  return image.naturalWidth > 0 ? "loaded" : "failed";
}

export function ArtworkImage({ artwork }: { artwork: ArtworkImageData }) {
  const previewSource =
    artwork.thumbnailUrl && artwork.thumbnailUrl !== artwork.imageUrl ? artwork.thumbnailUrl : null;
  const fullSource = artwork.imageUrl || (previewSource ? null : artwork.thumbnailUrl);
  const previewRef = useRef<HTMLImageElement>(null);
  const fullRef = useRef<HTMLImageElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [previewState, setPreviewState] = useState<ImageState>(
    previewSource ? "loading" : "failed",
  );
  const [fullState, setFullState] = useState<ImageState>(fullSource ? "loading" : "failed");
  const viewportConstrainedWidth = `min(100%, calc(var(--artwork-max-height) * ${artwork.imageWidth / artwork.imageHeight}))`;
  const hasLoadedImage = previewState === "loaded" || fullState === "loaded";
  const isUnavailable = previewState === "failed" && fullState === "failed";
  const hideFullImage = isHydrated && fullState !== "loaded";

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    const state = readImageState(previewRef.current);
    if (state) setPreviewState(state);
  }, [previewSource]);

  useEffect(() => {
    const state = readImageState(fullRef.current);
    if (state) setFullState(state);
  }, [fullSource]);

  return (
    <div
      className="relative w-full max-h-[var(--artwork-max-height)] max-w-full overflow-hidden rounded-[min(1vw,10px)] bg-neutral-100 shadow-sm outline-1 -outline-offset-1 outline-black/10 [--artwork-max-height:calc(100dvh-8.5rem)] sm:[--artwork-max-height:calc(100dvh-10rem)] lg:[--artwork-max-height:calc(100dvh-8.5rem)]"
      style={{
        aspectRatio: `${artwork.imageWidth} / ${artwork.imageHeight}`,
        maxWidth: viewportConstrainedWidth,
      }}
      role={isUnavailable ? undefined : "img"}
      aria-label={isUnavailable ? undefined : artwork.alt}
    >
      {!hasLoadedImage && !isUnavailable ? (
        <Skeleton className="absolute inset-0 z-0 size-full rounded-none bg-neutral-200" />
      ) : null}
      {previewSource && previewState !== "failed" ? (
        <img
          ref={previewRef}
          src={previewSource}
          alt=""
          aria-hidden="true"
          width={artwork.imageWidth}
          height={artwork.imageHeight}
          className={`absolute inset-0 z-10 size-full object-contain transition-[opacity,filter] duration-150 ease-in motion-reduce:transition-none ${fullState === "loaded" ? "opacity-0 blur-[4px]" : "opacity-100 blur-0"}`}
          decoding="async"
          fetchPriority="high"
          onLoad={() => setPreviewState("loaded")}
          onError={() => setPreviewState("failed")}
        />
      ) : null}
      {fullSource && fullState !== "failed" ? (
        <img
          ref={fullRef}
          src={fullSource}
          alt=""
          aria-hidden="true"
          width={artwork.imageWidth}
          height={artwork.imageHeight}
          className={`absolute inset-0 z-20 size-full object-contain transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${hideFullImage ? "scale-[1.01] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
          decoding="async"
          fetchPriority="high"
          onLoad={() => setFullState("loaded")}
          onError={() => setFullState("failed")}
        />
      ) : null}
      {isUnavailable ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-6 text-center text-base text-neutral-500 sm:text-sm"
          role="status"
        >
          Image unavailable
        </div>
      ) : null}
    </div>
  );
}
