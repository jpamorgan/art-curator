import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { getSafeReturnTo } from "@/lib/safe-return-to";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Log in — Art" },
      { name: "description", content: "Log in to save art you love." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const returnTo = getSafeReturnTo(redirect);

  return (
    <div className="isolate min-h-[calc(100dvh-4rem)] bg-white px-5 py-14 text-neutral-950 sm:py-20">
      <div className="mx-auto flex w-full max-w-xs flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-balance text-2xl font-medium tracking-tight">
            {mode === "sign-in" ? "Log in" : "Create an account"}
          </h1>
          <div
            className="grid grid-cols-2 rounded-full bg-neutral-100 p-1"
            role="group"
            aria-label="Account access"
            aria-busy={isAuthenticating}
          >
            <button
              type="button"
              aria-pressed={mode === "sign-in"}
              disabled={isAuthenticating}
              onClick={() => setMode("sign-in")}
              className="min-h-10 rounded-full px-3 text-base font-medium transition-transform duration-150 ease-out outline-none active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait aria-pressed:bg-white aria-pressed:shadow-sm aria-pressed:ring-1 aria-pressed:ring-black/5 sm:text-sm"
            >
              Log in
            </button>
            <button
              type="button"
              aria-pressed={mode === "sign-up"}
              disabled={isAuthenticating}
              onClick={() => setMode("sign-up")}
              className="min-h-10 rounded-full px-3 text-base font-medium transition-transform duration-150 ease-out outline-none active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait aria-pressed:bg-white aria-pressed:shadow-sm aria-pressed:ring-1 aria-pressed:ring-black/5 sm:text-sm"
            >
              Sign up
            </button>
          </div>
        </div>

        {mode === "sign-in" ? (
          <SignInForm returnTo={returnTo} onPendingChange={setIsAuthenticating} />
        ) : (
          <SignUpForm returnTo={returnTo} onPendingChange={setIsAuthenticating} />
        )}
      </div>
    </div>
  );
}
