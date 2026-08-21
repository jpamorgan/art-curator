import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type ResolvedUserId = string | null;

export function scopePrivateQueryKey<TQueryKey extends QueryKey>(
  queryKey: TQueryKey,
  userId: ResolvedUserId,
) {
  return [...queryKey, { privateUserId: userId }] as const;
}

export function queryKeyBelongsToUser(queryKey: QueryKey, userId: string) {
  const scope = queryKey.at(-1);
  return (
    scope !== null &&
    typeof scope === "object" &&
    "privateUserId" in scope &&
    scope.privateUserId === userId
  );
}

export function shouldClearPrivateArtData(
  previousUserId: ResolvedUserId | undefined,
  nextUserId: ResolvedUserId,
) {
  return previousUserId === undefined ? nextUserId === null : previousUserId !== nextUserId;
}

export function clearFavoriteFlags<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(clearFavoriteFlags) as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (key === "isFavorite" || key === "isFollowing") && typeof entry === "boolean"
        ? false
        : clearFavoriteFlags(entry),
    ]),
  ) as T;
}

export function clearPrivateArtQueryState(
  queryClient: Pick<QueryClient, "removeQueries" | "setQueriesData">,
  favoritesQueryKey: QueryKey,
  artworksQueryKey: QueryKey,
  keepUserId: string | null,
) {
  queryClient.removeQueries({
    queryKey: favoritesQueryKey,
    predicate: (query) => keepUserId === null || !queryKeyBelongsToUser(query.queryKey, keepUserId),
  });
  queryClient.setQueriesData({ queryKey: artworksQueryKey }, clearFavoriteFlags);
}

export function isFavoritesPath(pathname: string) {
  return /^\/favorites\/?$/u.test(pathname);
}

export function isPrivateArtPath(pathname: string) {
  return isFavoritesPath(pathname) || /^\/following\/?$/u.test(pathname);
}
