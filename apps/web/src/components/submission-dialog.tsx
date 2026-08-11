import { createSubmissionSchema, type SubmissionKind } from "@art/api/submission-contract";
import { env } from "@art/env/web";
import { ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
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
      <button
        ref={triggerRef}
        type="button"
        aria-label="Submit art"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-[scale] duration-150 ease-out hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none"
        onClick={openDialog}
      >
        <Plus aria-hidden="true" className="size-5 shrink-0 stroke-current" />
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-3xl border-0 bg-white p-0 text-neutral-950 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_20px_60px_rgba(0,0,0,0.20)] backdrop:bg-black/35 open:flex open:flex-col"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-start gap-4 px-5 pt-5 pb-4 sm:px-7 sm:pt-7 sm:pb-5">
            <div className="min-w-0 flex-1">
              <h2
                id={`${dialogId}-title`}
                className="text-balance text-2xl/8 font-semibold tracking-[-0.025em] sm:text-3xl/9"
              >
                Submit
              </h2>
              <p
                id={`${dialogId}-description`}
                className="text-pretty pt-1 text-base/6 text-neutral-500 sm:text-base/7"
              >
                Send something you think belongs in the collection.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close submission dialog"
              className="flex size-12 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-[scale] duration-150 ease-out hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 active:scale-[0.96] motion-reduce:transition-none"
              onClick={closeDialog}
            >
              <X aria-hidden="true" className="size-5 shrink-0 stroke-current" />
            </button>
          </header>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain border-t border-black/8 px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-4">
                <label className="inline-grid grid-cols-[1fr_--spacing(8)]">
                  <span className="sr-only">Submission kind</span>
                  <select
                    name="kind"
                    value={kind}
                    disabled={isSubmitting}
                    className="col-span-full row-start-1 min-h-12 cursor-pointer appearance-none rounded-full bg-white py-2 pr-9 pl-4 text-base text-neutral-950 ring-1 ring-black/15 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:bg-neutral-50 disabled:text-neutral-500"
                    onChange={(event) => {
                      setKind(event.currentTarget.value as SubmissionKind);
                      setError(null);
                    }}
                  >
                    {SUBMISSION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none col-start-2 row-start-1 size-4 shrink-0 place-self-center stroke-neutral-500"
                  />
                </label>
                <p id={helperId} className="text-pretty text-base/6 text-neutral-500 sm:text-sm/6">
                  {selected.helper}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor={`${dialogId}-url`} className="sr-only">
                  Public URL
                </label>
                <input
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
                  className="min-h-13 w-full min-w-0 rounded-2xl bg-white px-4 py-3 text-base text-neutral-950 ring-1 ring-black/20 outline-none placeholder:text-neutral-400 focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:bg-neutral-50 disabled:text-neutral-500"
                  onChange={(event) => {
                    setUrl(event.currentTarget.value);
                    if (error) setError(null);
                  }}
                />
                <p
                  id={errorId}
                  role={error ? "alert" : undefined}
                  className="min-h-5 text-pretty text-base/5 text-red-700 sm:text-sm/5"
                >
                  {error}
                </p>
              </div>
            </div>

            <footer className="grid grid-cols-2 gap-2 border-t border-black/8 p-4 sm:flex sm:items-center sm:justify-between sm:px-7 sm:py-5">
              <button
                type="button"
                disabled={isSubmitting}
                className="min-h-12 rounded-full bg-neutral-100 px-4 text-base font-medium text-neutral-950 transition-[scale] duration-150 ease-out hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none sm:text-sm"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button
                type="submit"
                aria-busy={isSubmitting}
                disabled={isSubmitting || url.trim().length === 0}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-neutral-950 px-4 text-base font-medium text-white transition-[scale] duration-150 ease-out hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 motion-reduce:transition-none sm:text-sm"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin stroke-current motion-reduce:animate-none"
                  />
                ) : null}
                {isSubmitting ? "Submitting…" : "Submit"}
              </button>
            </footer>
          </form>
        </div>
      </dialog>
    </>
  );
}
