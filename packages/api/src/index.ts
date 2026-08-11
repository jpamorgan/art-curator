import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Log in to view or change favorites.",
    });
  }

  const session = context.session;

  return next({
    context: {
      ...context,
      session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
