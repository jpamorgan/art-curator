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
      this.returnFocus = document.activeElement;
      this.open = true;
      this.querySelector("input")?.focus();
    },
  },
  close: {
    configurable: true,
    value() {
      this.open = false;
      this.returnFocus?.focus();
      this.dispatchEvent(new dom.window.Event("close"));
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
});

describe("SubmissionDialog", () => {
  test("defines a complete visible focus ring on the icon trigger", () => {
    const view = render(createElement(SubmissionDialog));
    const trigger = view.getByRole("button", { name: "Submit art" });

    expect(trigger.className).toContain("focus-visible:outline-2");
    expect(trigger.className).toContain("focus-visible:outline-offset-2");
    expect(trigger.className).toContain("focus-visible:outline-solid");
    expect(trigger.className).toContain("focus-visible:outline-neutral-950");
  });

  test("opens with input focus and returns focus after close", async () => {
    const view = render(createElement(SubmissionDialog));
    const trigger = view.getByRole("button", { name: "Submit art" });
    act(() => trigger.focus());
    fireEvent.click(trigger);

    const dialog = view.getByRole("dialog", { name: "Add a link" });
    const input = view.getByRole("textbox", { name: "Link" });
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(dialog.getAttribute("aria-describedby")).toBe(`${dialog.id}-helper`);
    expect(input.getAttribute("aria-describedby")).toBe(`${dialog.id}-helper`);

    const cancel = new dom.window.Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    if (!cancel.defaultPrevented) dialog.close();
    await waitFor(() => expect(dialog.open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  test("rejects an unsafe URL without a request", async () => {
    const view = render(createElement(SubmissionDialog));
    openAndFill(view, "http://localhost/work");
    submit(view);

    const alert = await view.findByRole("alert");
    expect(alert.textContent).toContain("Enter a public HTTPS URL.");
    expect(view.getByRole("textbox", { name: "Link" }).getAttribute("aria-describedby")).toBe(
      `${view.getByRole("dialog").id}-helper ${alert.id}`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("saves just the URL and reports a new link", async () => {
    fetchMock.mockResolvedValueOnce(response({ alreadySaved: false }, 201));
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved to the inbox."));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: "https://example.com/work",
    });
  });

  test("reports a link that is already in the inbox", async () => {
    fetchMock.mockResolvedValueOnce(response({ alreadySaved: true }));
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Already in the inbox."));
  });

  test("prevents duplicate submits and closing while a save is pending", async () => {
    const pending = deferred();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const view = render(createElement(SubmissionDialog));

    openAndFill(view);
    submit(view);
    fireEvent.submit(view.getByRole("button", { name: "Saving…" }).closest("form"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const dialog = view.getByRole("dialog", { name: "Add a link" });
    expect(view.getByRole("button", { name: "Cancel" }).disabled).toBe(true);
    expect(
      view.getByRole("button", { name: "Saving…" }).querySelector("svg").getAttribute("class"),
    ).toContain("motion-reduce:animate-none");
    const cancel = new dom.window.Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);

    await act(async () => {
      pending.resolve(response({ alreadySaved: false }, 201));
      await pending.promise;
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved to the inbox."));
    expect(dialog.open).toBe(false);
  });

  test("shows a save error and clears it when the link changes", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "inbox_unavailable" }, 503));
    const view = render(createElement(SubmissionDialog));
    const { input } = openAndFill(view);
    submit(view);

    expect((await view.findByRole("alert")).textContent).toContain("could not save");
    fireEvent.change(input, { target: { value: "https://example.com/another" } });
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("reports a distinct request timeout", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeout);
    const view = render(createElement(SubmissionDialog));
    openAndFill(view);
    submit(view);

    expect((await view.findByRole("alert")).textContent).toContain("timed out");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
