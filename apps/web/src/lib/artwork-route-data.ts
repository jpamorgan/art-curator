import { notFound } from "@tanstack/react-router";

import { loadValidatedBrowseData } from "@/lib/browse-route-data";

export async function loadArtworkRouteData<T>(load: () => Promise<T>): Promise<T> {
  const data = await loadValidatedBrowseData(load);

  if (data === null) throw notFound();

  return data;
}
