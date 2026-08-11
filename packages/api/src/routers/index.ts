import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { artworksRouter, favoritesRouter, galleriesRouter, stylesRouter } from "./art";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => ({ status: "ok" as const })),
  artworks: artworksRouter,
  galleries: galleriesRouter,
  styles: stylesRouter,
  favorites: favoritesRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
