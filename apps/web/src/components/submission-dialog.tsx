import { createSubmissionSchema } from "@art/api/submission-contract";
import { env } from "@art/env/web";
import { Button } from "@art/ui/components/button";
import { Input } from "@art/ui/components/input";
import { LoaderCircle, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

const SUBMISSION_TIMEOUT_MS = 12_000;

export default function SubmissionDialog() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const dialog = event.currentTarget.closest("dialog");
    const parsed = createSubmissionSchema.safeParse({ url });
    if (!parsed.success) {
      setError("Enter a public HTTPS URL.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const signal = AbortSignal.timeout(SUBMISSION_TIMEOUT_MS);
    try {
      const response = await fetch(new URL("/submissions", env.VITE_SERVER_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data),
        signal,
      });
      if (!response.ok) {
        setError(
          response.status === 403
            ? "This form could not be verified. Refresh and try again."
            : "We could not save this submission. Try again.",
        );
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { alreadySaved?: boolean };
      dialog?.close();
      toast.success(body.alreadySaved ? "Already in the inbox." : "Saved to the inbox.");
    } catch (caught) {
      const timedOut = caught instanceof Error && caught.name === "TimeoutError";
      setError(
        timedOut
          ? "The submission timed out. Try again."
          : "We could not reach the submission inbox. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label="Submit art"
        aria-haspopup="dialog"
        className="size-12 rounded-full border-0 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 sm:size-10"
        onClick={(event) => {
          setError(null);
          (event.currentTarget.nextElementSibling as HTMLDialogElement | null)?.showModal();
        }}
      >
        <Plus aria-hidden="true" className="size-5 sm:size-4" />
      </Button>

      <dialog
        id={dialogId}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-helper`}
        className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border-0 bg-white text-neutral-950 shadow-xl backdrop:bg-black/32"
        onCancel={(event) => isSubmitting && event.preventDefault()}
        onClose={() => setUrl("")}
        onClick={(event) => {
          if (event.target === event.currentTarget && !isSubmitting) event.currentTarget.close();
        }}
      >
        <form className="grid gap-4 p-6" onSubmit={(event) => void submit(event)}>
          <h2 id={`${dialogId}-title`} className="text-2xl font-semibold tracking-tight">
            Add a link
          </h2>
          <p id={`${dialogId}-helper`} className="text-sm text-neutral-500">
            Save an artwork, artist, gallery, or collection to consider.
          </p>
          <label htmlFor={`${dialogId}-url`} className="text-sm font-medium">
            Link
          </label>
          <Input
            id={`${dialogId}-url`}
            name="url"
            type="url"
            autoComplete="url"
            autoFocus
            required
            value={url}
            placeholder="https://…"
            aria-describedby={error ? `${dialogId}-helper ${dialogId}-error` : `${dialogId}-helper`}
            aria-invalid={error ? true : undefined}
            disabled={isSubmitting}
            onChange={(event) => {
              setUrl(event.currentTarget.value);
              setError(null);
            }}
          />
          {error ? (
            <p id={`${dialogId}-error`} role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={(event) => event.currentTarget.closest("dialog")?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" aria-busy={isSubmitting} disabled={isSubmitting || !url.trim()}>
              {isSubmitting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {isSubmitting ? "Saving…" : "Save link"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
