import { afterEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";

const toastSuccess = mock(() => {});
mock.module("@art/env/web", () => ({
  env: { VITE_SERVER_URL: "https://api.art.jpamorgan.com" },
}));
mock.module("sonner", () => ({ toast: { success: toastSuccess } }));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://art.jpamorgan.com/",
});

Object.defineProperties(globalThis, {
  document: { configurable: true, value: dom.window.document },
  Element: { configurable: true, value: dom.window.Element },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLDialogElement: { configurable: true, value: dom.window.HTMLDialogElement },
  Node: { configurable: true, value: dom.window.Node },
  navigator: { configurable: true, value: dom.window.navigator },
  window: { configurable: true, value: dom.window },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.open = true;
    },
  },
  close: {
    configurable: true,
    value() {
      this.open = false;
    },
  },
});

const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { default: SubmissionDialog } = await import("./submission-dialog");

const fetchMock = mock();
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: fetchMock,
});

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function openAndFill(view, url = "https://example.com/work") {
  const trigger = view.getByRole("button", { name: "Submit art" });
  fireEvent.click(trigger);
  const input = view.getByRole("textbox", { name: "Public URL" });
  fireEvent.change(input, { target: { value: url } });
  return { input, trigger };
}

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  toastSuccess.mockReset();
  document.documentElement.style.overflow = "";
});

describe("SubmissionDialog", () => {
  test("opens with input focus and returns focus after close", async () => {
    const view = render(createElement(SubmissionDialog));
    const trigger = view.getByRole("button", { name: "Submit art" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = view.getByRole("dialog", { name: "Submit" });
    const input = view.getByRole("textbox", { name: "Public URL" });
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent(dialog, new dom.window.Event("cancel", { cancelable: true }));
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).toBe("");

    fireEvent.click(trigger);
    expect(dialog.open).toBe(true);
    fireEvent.click(dialog);
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  test("rejects an unsafe URL without a request", async () => {
    const view = render(createElement(SubmissionDialog));
    openAndFill(view, "http://localhost/work");
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));

    expect((await view.findByRole("alert")).textContent).toContain("Enter a public HTTPS URL.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("prevents duplicate submits and reports duplicate and rate-limit results", async () => {
    const pending = deferred();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    const form = view.getByRole("button", { name: "Submit" }).closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.getByRole("button", { name: "Submitting…" }).disabled).toBe(true);

    await act(async () => {
      pending.resolve(
        response({
          submission: { id: "one", status: "pending" },
          alreadyReceived: true,
          reopened: false,
        }),
      );
      await pending.promise;
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Already received — thanks for the reminder."),
    );

    fetchMock.mockResolvedValueOnce(response({ error: "submission_rate_limited" }, 429));
    openAndFill(view, "https://example.com/another-work");
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));
    expect((await view.findByRole("alert")).textContent).toContain(
      "Submission limit reached. Try again later.",
    );
  });

  test("reports a newly queued submission", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        submission: { id: "new", status: "pending" },
        alreadyReceived: false,
        reopened: false,
      }),
    );
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Thanks — your submission is in the review queue."),
    );
  });

  test("an old aborted request cannot clear a newer submission's loading state", async () => {
    const first = deferred();
    const second = deferred();
    fetchMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const view = render(createElement(SubmissionDialog));

    openAndFill(view, "https://example.com/first");
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));
    const firstSignal = fetchMock.mock.calls[0][1].signal;
    fireEvent.click(view.getByRole("button", { name: "Close submission dialog" }));
    expect(firstSignal.aborted).toBe(true);

    openAndFill(view, "https://example.com/second");
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      first.reject(abortError);
      await first.promise.catch(() => {});
    });
    expect(view.getByRole("button", { name: "Submitting…" }).disabled).toBe(true);

    await act(async () => {
      second.resolve(
        response({
          submission: { id: "two", status: "pending" },
          alreadyReceived: false,
          reopened: true,
        }),
      );
      await second.promise;
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Thanks — we reopened this submission for review."),
    );
  });

  test("aborts an in-flight request when unmounted", () => {
    const pending = deferred();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    fireEvent.submit(view.getByRole("button", { name: "Submit" }).closest("form"));
    const signal = fetchMock.mock.calls[0][1].signal;

    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
