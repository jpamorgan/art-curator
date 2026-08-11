import { createSubmissionSchema, type SubmissionKind } from "@art/api/submission-contract";
import { env } from "@art/env/web";
import { Button } from "@art/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@art/ui/components/field";
import { Input } from "@art/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@art/ui/components/select";
import { LoaderCircle, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

const SUBMISSION_OPTIONS: ReadonlyArray<{
  value: SubmissionKind;
  label: string;
  helper: string;
  placeholder: string;
}> = [
  {
    value: "artwork",
    label: "Artwork",
    helper: "Use an X, Instagram, or artwork page URL",
    placeholder: "https://x.com/artist/status/…",
  },
  {
    value: "artist",
    label: "Artist",
    helper: "Use an artist profile or portfolio URL",
    placeholder: "https://artist.example.com",
  },
  {
    value: "collection",
    label: "Gallery / Collection",
    helper: "Use a gallery, museum, or collection URL",
    placeholder: "https://gallery.example.com",
  },
];
const SUBMISSION_TIMEOUT_MS = 12_000;
const SUBMISSION_SELECT_ITEMS = SUBMISSION_OPTIONS.map(({ label, value }) => ({ label, value }));

type SubmissionResponse = {
  submission?: { id: string; status: string };
  alreadyReceived?: boolean;
  reopened?: boolean;
  error?: string;
};

export default function SubmissionDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kind, setKind] = useState<SubmissionKind>("artwork");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dialogId = useId();
  const helperId = useId();
  const errorId = useId();
  const selected = SUBMISSION_OPTIONS.find((option) => option.value === kind)!;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      const previousOverflow = document.documentElement.style.overflow;
      dialog.showModal();
      wasOpenRef.current = true;
      document.documentElement.style.overflow = "hidden";
      inputRef.current?.focus();
      return () => {
        document.documentElement.style.overflow = previousOverflow;
      };
    }
    if (!isOpen && wasOpenRef.current) {
      if (dialog.open) dialog.close();
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    },
    [],
  );

  function openDialog() {
    setError(null);
    setIsOpen(true);
  }

  function closeDialog() {
    requestRef.current?.abort();
    requestRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsSubmitting(false);
    setError(null);
    setUrl("");
    setKind("artwork");
    setIsOpen(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = createSubmissionSchema.safeParse({ kind, url });
    if (!parsed.success) {
      setError("Enter a public HTTPS URL.");
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SUBMISSION_TIMEOUT_MS);
    timeoutRef.current = timeout;
    requestRef.current = controller;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(new URL("/submissions", env.VITE_SERVER_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as SubmissionResponse;
      if (!response.ok) {
        if (response.status === 403) {
          setError("This form could not be verified. Refresh and try again.");
        } else if (response.status === 429) {
          setError("Submission limit reached. Try again later.");
        } else if (body.error === "invalid_submission") {
          setError("Enter a public HTTPS URL.");
        } else {
          setError("We could not save this submission. Try again.");
        }
        return;
      }

      closeDialog();
      toast.success(
        body.reopened
          ? "Thanks — we reopened this submission for review."
          : body.alreadyReceived
            ? "Already received — thanks for the reminder."
            : "Thanks — your submission is in the review queue.",
      );
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        if (timedOut) setError("The submission timed out. Try again.");
        return;
      }
      setError("We could not reach the submission inbox. Try again.");
    } finally {
      window.clearTimeout(timeout);
      if (timeoutRef.current === timeout) timeoutRef.current = null;
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsSubmitting(false);
      }
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Submit art"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        className="size-12 rounded-full border-0 bg-neutral-100 text-neutral-700 transition-[scale] duration-150 ease-out hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none sm:size-10"
        onClick={openDialog}
      >
        <Plus aria-hidden="true" className="size-5 shrink-0 stroke-current sm:size-4" />
      </Button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-lg overflow-hidden rounded-2xl border-0 bg-white p-0 text-neutral-950 shadow-xl/10 ring-1 ring-black/10 backdrop:bg-black/32 backdrop:backdrop-blur-sm open:flex open:flex-col"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="flex min-h-0 flex-col">
          <header className="flex items-start gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <div className="min-w-0 flex-1">
              <h2
                id={`${dialogId}-title`}
                className="text-balance text-2xl font-semibold tracking-tight"
              >
                Submit
              </h2>
              <p
                id={`${dialogId}-description`}
                className="text-pretty pt-1 text-base/6 text-neutral-500 sm:text-sm/5"
              >
                Send something you think belongs in the collection.
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close submission dialog"
              className="size-11 rounded-full border-0 text-neutral-500 transition-[scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none sm:size-10"
              onClick={closeDialog}
            >
              <X aria-hidden="true" className="size-5 shrink-0 stroke-current sm:size-4" />
            </Button>
          </header>

          <form className="flex min-h-0 flex-col" onSubmit={(event) => void submit(event)}>
            <div className="grid gap-5 overflow-y-auto overscroll-contain border-t border-black/8 px-5 py-5 sm:px-6 sm:py-6">
              <Field>
                <FieldLabel>Submission type</FieldLabel>
                <Select
                  name="kind"
                  items={SUBMISSION_SELECT_ITEMS}
                  value={kind}
                  disabled={isSubmitting}
                  onValueChange={(value) => {
                    if (!value) return;
                    setKind(value as SubmissionKind);
                    setError(null);
                  }}
                >
                  <SelectTrigger aria-label="Submission kind" size="lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup portalProps={{ container: dialogRef }}>
                    {SUBMISSION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>

              <Field invalid={Boolean(error)}>
                <FieldLabel htmlFor={`${dialogId}-url`}>Public URL</FieldLabel>
                <Input
                  ref={inputRef}
                  id={`${dialogId}-url`}
                  name="url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoComplete="url"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  required
                  value={url}
                  placeholder={selected.placeholder}
                  aria-describedby={error ? `${helperId} ${errorId}` : helperId}
                  aria-invalid={error ? true : undefined}
                  disabled={isSubmitting}
                  size="lg"
                  onChange={(event) => {
                    setUrl(event.currentTarget.value);
                    if (error) setError(null);
                  }}
                />
                <FieldDescription id={helperId} className="text-pretty text-base/5 sm:text-sm/5">
                  {selected.helper}.
                </FieldDescription>
                {error ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="text-pretty text-base/5 text-red-700 sm:text-sm/5"
                  >
                    {error}
                  </p>
                ) : null}
              </Field>
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t border-black/8 bg-neutral-50/80 px-5 py-4 sm:flex sm:items-center sm:justify-end sm:px-6">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={isSubmitting}
                className="h-11 rounded-lg border-0 px-4 text-base transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] motion-reduce:transition-none sm:h-10 sm:text-sm"
                onClick={closeDialog}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="lg"
                aria-busy={isSubmitting}
                disabled={isSubmitting || url.trim().length === 0}
                className="h-11 rounded-lg px-4 text-base transition-[scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 motion-reduce:transition-none sm:h-10 sm:text-sm"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin stroke-current motion-reduce:animate-none"
                  />
                ) : null}
                {isSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </footer>
          </form>
        </div>
      </dialog>
    </>
  );
}
