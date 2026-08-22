export type SitemapEntry = {
  path: string;
  lastModified: string | null;
};

type SitemapRows = {
  artworks: SitemapRow[];
  artists: SitemapRow[];
  galleries: SitemapRow[];
  styles: SitemapRow[];
};

type SitemapRow = {
  slug: string;
  lastModified: number | null;
};

export function buildSitemapEntries(rows: SitemapRows): SitemapEntry[] {
  const artworkEntries = detailEntries("art", rows.artworks);
  const artistEntries = detailEntries("artists", rows.artists);
  const galleryEntries = detailEntries("galleries", rows.galleries);
  const styleEntries = detailEntries("styles", rows.styles);

  return [
    { path: "/", lastModified: latestLastModified(artworkEntries) },
    { path: "/artists", lastModified: latestLastModified(artistEntries) },
    { path: "/galleries", lastModified: latestLastModified(galleryEntries) },
    { path: "/styles", lastModified: latestLastModified(styleEntries) },
    ...artworkEntries,
    ...artistEntries,
    ...galleryEntries,
    ...styleEntries,
  ];
}

function detailEntries(
  prefix: "art" | "artists" | "galleries" | "styles",
  rows: SitemapRow[],
): SitemapEntry[] {
  return rows.map((row) => ({
    path: `/${prefix}/${row.slug}`,
    lastModified: toSitemapDate(row.lastModified),
  }));
}

function toSitemapDate(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function latestLastModified(entries: SitemapEntry[]): string | null {
  return entries.reduce<string | null>(
    (latest, entry) =>
      entry.lastModified && (!latest || entry.lastModified > latest) ? entry.lastModified : latest,
    null,
  );
}
