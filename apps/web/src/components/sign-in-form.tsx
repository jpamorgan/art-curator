import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { PendingButtonLabel } from "@/components/pending-button-label";
import { authClient } from "@/lib/auth-client";
import { authenticateAndNavigate, confirmAuthenticatedSession } from "@/lib/auth-actions";

type SignInFormProps = {
  onPendingChange?: (isPending: boolean) => void;
  returnTo: string;
};

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Check this field.";
}

export default function SignInForm({ onPendingChange, returnTo }: SignInFormProps) {
  const navigate = useNavigate();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      setIsAuthenticating(true);
      onPendingChange?.(true);
      const error = await authenticateAndNavigate({
        authenticate: () =>
          authClient.signIn.email({
            email: value.email,
            password: value.password,
          }),
        confirmSession: () =>
          confirmAuthenticatedSession(async () => {
            const result = await authClient.getSession({
              query: { disableCookieCache: true },
            });
            return Boolean(result.data?.user);
          }),
        fallbackError: "Unable to log in.",
        navigate: (options) => navigate(options),
        returnTo,
      });
      if (error) {
        setSubmitError(error);
        setIsAuthenticating(false);
        onPendingChange?.(false);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <fieldset
        disabled={isAuthenticating}
        className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
      >
        <form.Field name="email">
          {(field) => {
            const errors = field.state.meta.errors.map(getErrorMessage);
            return (
              <div className="flex flex-col gap-2">
                <label className="text-base font-medium sm:text-sm" htmlFor="sign-in-email">
                  Email
                </label>
                <input
                  id="sign-in-email"
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length > 0 ? "sign-in-email-error" : undefined}
                  className="h-12 rounded-xl bg-white px-3 text-base outline-1 -outline-offset-1 outline-black/15 placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 sm:h-10 sm:text-sm"
                />
                {errors.length > 0 && (
                  <p id="sign-in-email-error" className="text-base text-red-700 sm:text-sm">
                    {errors[0]}
                  </p>
                )}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const errors = field.state.meta.errors.map(getErrorMessage);
            return (
              <div className="flex flex-col gap-2">
                <label className="text-base font-medium sm:text-sm" htmlFor="sign-in-password">
                  Password
                </label>
                <input
                  id="sign-in-password"
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length > 0 ? "sign-in-password-error" : undefined}
                  className="h-12 rounded-xl bg-white px-3 text-base outline-1 -outline-offset-1 outline-black/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 sm:h-10 sm:text-sm"
                />
                {errors.length > 0 && (
                  <p id="sign-in-password-error" className="text-base text-red-700 sm:text-sm">
                    {errors[0]}
                  </p>
                )}
              </div>
            );
          }}
        </form.Field>

        {submitError && (
          <p className="text-pretty text-base text-red-700 sm:text-sm" role="alert">
            {submitError}
          </p>
        )}

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <button
              type="submit"
              aria-busy={isAuthenticating || isSubmitting}
              className="h-12 rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-70 sm:h-10 sm:text-sm"
              disabled={!canSubmit || isAuthenticating || isSubmitting}
            >
              <PendingButtonLabel
                idle="Log in"
                pending="Logging in…"
                isPending={isAuthenticating || isSubmitting}
              />
            </button>
          )}
        </form.Subscribe>
      </fieldset>
    </form>
  );
}
