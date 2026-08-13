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
  const input = view.getByRole("textbox", { name: "Link" });
  fireEvent.change(input, { target: { value: url } });
  return { input, trigger };
}

function submit(view) {
  fireEvent.submit(view.getByRole("button", { name: "Save link" }).closest("form"));
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
    act(() => trigger.focus());
    fireEvent.click(trigger);

    const dialog = view.getByRole("dialog", { name: "Add a link" });
    const input = view.getByRole("textbox", { name: "Link" });
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent(dialog, new dom.window.Event("cancel", { cancelable: true }));
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).toBe("");
  });

  test("rejects an unsafe URL without a request", async () => {
    const view = render(createElement(SubmissionDialog));
    openAndFill(view, "http://localhost/work");
    submit(view);

    expect((await view.findByRole("alert")).textContent).toContain("Enter a public HTTPS URL.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("saves just the URL and reports a new link", async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        {
          link: {
            id: "00000000-0000-4000-8000-000000000001",
            url: "https://example.com/work",
            createdAt: "2026-08-13T12:00:00.000Z",
          },
          alreadySaved: false,
        },
        201,
      ),
    );
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved to the inbox."));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: "https://example.com/work",
    });
  });

  test("reports a link that is already in the inbox", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        link: {
          id: "00000000-0000-4000-8000-000000000001",
          url: "https://example.com/work",
          createdAt: "2026-08-13T12:00:00.000Z",
        },
        alreadySaved: true,
      }),
    );
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Already in the inbox."));
  });

  test("prevents duplicate submits and keeps a newer request loading", async () => {
    const first = deferred();
    const second = deferred();
    fetchMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const view = render(createElement(SubmissionDialog));

    openAndFill(view, "https://example.com/first");
    submit(view);
    fireEvent.submit(view.getByRole("button", { name: "Saving…" }).closest("form"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstSignal = fetchMock.mock.calls[0][1].signal;
    fireEvent.click(view.getByRole("button", { name: "Close submission dialog" }));
    expect(firstSignal.aborted).toBe(true);

    openAndFill(view, "https://example.com/second");
    submit(view);
    await act(async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      first.reject(abortError);
      await first.promise.catch(() => {});
    });
    expect(view.getByRole("button", { name: "Saving…" }).disabled).toBe(true);

    await act(async () => {
      second.resolve(
        response(
          {
            link: {
              id: "00000000-0000-4000-8000-000000000002",
              url: "https://example.com/second",
              createdAt: "2026-08-13T12:00:01.000Z",
            },
            alreadySaved: false,
          },
          201,
        ),
      );
      await second.promise;
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved to the inbox."));
  });

  test("aborts an in-flight request when unmounted", () => {
    const pending = deferred();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);
    const signal = fetchMock.mock.calls[0][1].signal;

    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
