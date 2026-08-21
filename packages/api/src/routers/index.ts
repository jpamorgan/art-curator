import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import {
  artistsRouter,
  artworksRouter,
  favoritesRouter,
  galleriesRouter,
  stylesRouter,
} from "./art";
import { followingRouter, recommendationsRouter } from "./recommendation";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => ({ status: "ok" as const })),
  artworks: artworksRouter,
  artists: artistsRouter,
  galleries: galleriesRouter,
  styles: stylesRouter,
  favorites: favoritesRouter,
  following: followingRouter,
  recommendations: recommendationsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
