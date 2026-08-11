import { GALLERY_GRID_CLASS_NAME } from "@/lib/gallery-layout";

const SKELETON_RATIOS = ["aspect-[4/5]", "aspect-[3/2]", "aspect-square", "aspect-[2/3]"];

interface GallerySkeletonProps {
  count?: number;
}

export function GallerySkeleton({ count = 12 }: GallerySkeletonProps) {
  return (
    <div aria-label="Loading artwork" aria-live="polite" className={GALLERY_GRID_CLASS_NAME}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-w-0" aria-hidden="true">
          <div
            className={`${SKELETON_RATIOS[index % SKELETON_RATIOS.length]} animate-pulse rounded-[min(1vw,12px)] bg-neutral-100 motion-reduce:animate-none`}
          />
          <div className="flex flex-col gap-1.5 py-2">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
            <div className="h-4 w-1/3 animate-pulse rounded-full bg-neutral-100 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
