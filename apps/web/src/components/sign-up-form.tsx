import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { authenticateAndNavigate, confirmAuthenticatedSession } from "@/lib/auth-actions";

type SignUpFormProps = {
  returnTo: string;
};

function getErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Check this field.";
}

export default function SignUpForm({ returnTo }: SignUpFormProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const error = await authenticateAndNavigate({
        authenticate: () =>
          authClient.signUp.email({
            email: value.email,
            password: value.password,
            name: value.name,
          }),
        confirmSession: () =>
          confirmAuthenticatedSession(async () => {
            const result = await authClient.getSession({
              query: { disableCookieCache: true },
            });
            return Boolean(result.data?.user);
          }),
        fallbackError: "Unable to create your account.",
        navigate: (options) => navigate(options),
        returnTo,
      });
      if (error) setSubmitError(error);
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
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
      <form.Field name="name">
        {(field) => {
          const errors = field.state.meta.errors.map(getErrorMessage);
          return (
            <div className="flex flex-col gap-2">
              <label className="text-base font-medium sm:text-sm" htmlFor="sign-up-name">
                Name
              </label>
              <input
                id="sign-up-name"
                name={field.name}
                type="text"
                autoComplete="name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? "sign-up-name-error" : undefined}
                className="h-12 rounded-xl bg-white px-3 text-base outline-1 -outline-offset-1 outline-black/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 sm:h-10 sm:text-sm"
              />
              {errors.length > 0 && (
                <p id="sign-up-name-error" className="text-base text-red-700 sm:text-sm">
                  {errors[0]}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field name="email">
        {(field) => {
          const errors = field.state.meta.errors.map(getErrorMessage);
          return (
            <div className="flex flex-col gap-2">
              <label className="text-base font-medium sm:text-sm" htmlFor="sign-up-email">
                Email
              </label>
              <input
                id="sign-up-email"
                name={field.name}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? "sign-up-email-error" : undefined}
                className="h-12 rounded-xl bg-white px-3 text-base outline-1 -outline-offset-1 outline-black/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 sm:h-10 sm:text-sm"
              />
              {errors.length > 0 && (
                <p id="sign-up-email-error" className="text-base text-red-700 sm:text-sm">
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
              <label className="text-base font-medium sm:text-sm" htmlFor="sign-up-password">
                Password
              </label>
              <input
                id="sign-up-password"
                name={field.name}
                type="password"
                autoComplete="new-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={errors.length > 0}
                aria-describedby={errors.length > 0 ? "sign-up-password-error" : undefined}
                className="h-12 rounded-xl bg-white px-3 text-base outline-1 -outline-offset-1 outline-black/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950 sm:h-10 sm:text-sm"
              />
              {errors.length > 0 && (
                <p id="sign-up-password-error" className="text-base text-red-700 sm:text-sm">
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
            className="h-12 rounded-full bg-neutral-950 px-3 text-base font-medium text-white outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
