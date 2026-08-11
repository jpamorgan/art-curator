export const GALLERY_GAP = 10;

export const GALLERY_COLUMN_LAYOUT = [
  { minWidth: 0, columns: 1, className: "grid-cols-1" },
  { minWidth: 520, columns: 2, className: "@min-[520px]:grid-cols-2" },
  { minWidth: 800, columns: 3, className: "@min-[800px]:grid-cols-3" },
  { minWidth: 1_120, columns: 4, className: "@min-[1120px]:grid-cols-4" },
  { minWidth: 1_440, columns: 5, className: "@min-[1440px]:grid-cols-5" },
] as const;

export const GALLERY_GRID_CLASS_NAME = [
  "grid",
  "gap-[10px]",
  ...GALLERY_COLUMN_LAYOUT.map((step) => step.className),
].join(" ");

export function getGalleryColumnCount(width: number) {
  let columns = 1;

  for (const step of GALLERY_COLUMN_LAYOUT) {
    if (width >= step.minWidth) columns = step.columns;
  }

  return columns;
}

export function getGalleryItemWidth(width: number) {
  const columns = getGalleryColumnCount(width);
  return Math.max(1, (width - GALLERY_GAP * Math.max(columns - 1, 0)) / columns);
}
