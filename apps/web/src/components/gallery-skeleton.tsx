import { Skeleton } from "@art/ui/components/skeleton";

import { GALLERY_GRID_CLASS_NAME } from "@/lib/gallery-layout";

const SKELETON_RATIOS = ["aspect-[4/5]", "aspect-[3/2]", "aspect-square", "aspect-[2/3]"];

interface GallerySkeletonProps {
  announce?: boolean;
  count?: number;
  label?: string;
}

export function GallerySkeleton({
  announce = true,
  count = 12,
  label = "Loading artwork",
}: GallerySkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-live={announce ? "polite" : undefined}
      role={announce ? "status" : undefined}
      className={GALLERY_GRID_CLASS_NAME}
    >
      {announce ? <span className="sr-only">{label}</span> : null}
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-w-0" aria-hidden="true">
          <div className="relative">
            <Skeleton
              className={`${SKELETON_RATIOS[index % SKELETON_RATIOS.length]} rounded-[min(1vw,12px)] bg-neutral-100 outline-1 -outline-offset-1 outline-black/5`}
            />
            <Skeleton className="absolute top-2 right-2 size-12 rounded-full bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:pointer-fine:size-10" />
          </div>
          <div className="flex min-w-0 items-start justify-between gap-2 px-0.5 pt-2 pb-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3 rounded-full bg-neutral-100" />
              <Skeleton className="h-4 w-2/5 rounded-full bg-neutral-100" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0 rounded-full bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GalleryPageSkeleton() {
  return (
    <div className="@container px-2 py-2 sm:px-3">
      <GallerySkeleton />
    </div>
  );
}
