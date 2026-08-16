import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement, StrictMode } from "react";

process.env.VITE_SERVER_URL ??= "https://api.art.jpamorgan.com";

const session = {
  user: {
    id: "user-1",
    name: "John Philip Morgan",
    email: "John.Morgan+Art@Example.com",
  },
};
const secondSession = {
  user: {
    id: "user-2",
    name: "Ada Lovelace",
    email: "ada@example.com",
  },
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://art.jpamorgan.com/",
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperties(globalThis, {
  cancelAnimationFrame: { configurable: true, value: (id) => clearTimeout(id) },
  document: { configurable: true, value: dom.window.document },
  Element: { configurable: true, value: dom.window.Element },
  Event: { configurable: true, value: dom.window.Event },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLImageElement: { configurable: true, value: dom.window.HTMLImageElement },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  Node: { configurable: true, value: dom.window.Node },
  navigator: { configurable: true, value: dom.window.navigator },
  requestAnimationFrame: { configurable: true, value: (callback) => setTimeout(callback, 0) },
  ResizeObserver: { configurable: true, value: ResizeObserverMock },
  window: { configurable: true, value: dom.window },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { hydrateRoot } = await import("react-dom/client");
const { renderToString } = await import("react-dom/server");
const { AuthenticatedUserMenu, getAvatarInitials, getUnavatarUrl } = await import("./user-menu");

const navigateMock = mock(async () => {});
const signOutMock = mock(async () => ({ error: null }));
const clearPrivateArtMock = mock(() => {});
const reportErrorMock = mock(() => {});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function menuProps(currentSession = session) {
  return {
    clearPrivateArt: clearPrivateArtMock,
    navigate: navigateMock,
    reportError: reportErrorMock,
    session: currentSession,
    signOut: signOutMock,
  };
}

async function renderAuthenticatedMenu(currentSession = session) {
  const view = render(createElement(AuthenticatedUserMenu, menuProps(currentSession)));
  const accountName = currentSession.user.name || currentSession.user.email.split("@")[0];
  const trigger = view.getByRole("button", { name: `Account menu for ${accountName}` });
  await waitFor(() => expect(trigger.querySelector('[data-slot="account-avatar"]')).toBeTruthy());
  return { trigger, view };
}

async function openAuthenticatedMenu() {
  const result = await renderAuthenticatedMenu();
  fireEvent.click(result.trigger);
  await result.view.findByRole("menuitem", { name: "Logout" });
  return result;
}

beforeEach(() => {
  navigateMock.mockReset();
  signOutMock.mockReset();
  clearPrivateArtMock.mockReset();
  reportErrorMock.mockReset();
  navigateMock.mockImplementation(async () => {});
  signOutMock.mockImplementation(async () => ({ error: null }));
});

afterEach(cleanup);

describe("avatar helpers", () => {
  test("uses the exact normalized SHA-256 in the documented Unavatar Gravatar route", async () => {
    const expectedHash = "eeab2b8936326e55b96938645e2f0f8806a0315f9d55468234dd74d2187e988d";
    const url = await getUnavatarUrl(session.user.email);

    expect(url).toBe(`https://unavatar.io/gravatar/${expectedHash}`);
    expect(await getUnavatarUrl("  JOHN.MORGAN+ART@example.COM  ")).toBe(url);
    expect(url).not.toContain(session.user.email);
    expect(url).not.toContain(encodeURIComponent(session.user.email));
    expect(url).not.toContain("john.morgan");
    expect(url).not.toContain("size=");
  });

  test("derives deterministic initials without exposing the email", () => {
    expect(getAvatarInitials("John Philip Morgan", session.user.email)).toBe("JP");
    expect(getAvatarInitials("", "artist@example.com")).toBe("A");
  });
});

describe("AuthenticatedUserMenu", () => {
  test("renders an avatar-only trigger and the minimal end-aligned account popup", async () => {
    const { trigger, view } = await openAuthenticatedMenu();

    expect(trigger.textContent).toBe("");
    expect(trigger.className).toContain("size-10");
    expect(trigger.className).toContain("focus-visible:outline-solid");
    expect(trigger.querySelector("img")?.getAttribute("src")).toMatch(
      /^https:\/\/unavatar\.io\/gravatar\/[a-f0-9]{64}$/u,
    );
    expect(view.getByText("John Philip Morgan")).toBeTruthy();
    expect(view.getByText(session.user.email)).toBeTruthy();
    expect(view.queryByText("Favorites")).toBeNull();
    expect(view.getByRole("menuitem", { name: "Logout" })).toBeTruthy();
    const popup = document.querySelector('[data-slot="dropdown-menu-content"]');
    expect(popup?.getAttribute("data-align")).toBe("end");
    expect(popup?.className).toContain("rounded-2xl");
  });

  test("restores a solid focus outline on authenticated and signed-out controls", async () => {
    const source = await Bun.file(new URL("./user-menu.tsx", import.meta.url)).text();

    expect(source.match(/focus-visible:outline-solid/gu)).toHaveLength(2);
  });

  test("uses a one-shot deterministic initials fallback after an image error", async () => {
    const { trigger } = await renderAuthenticatedMenu();
    const image = trigger.querySelector('[data-slot="account-avatar"]');

    fireEvent.error(image);

    await waitFor(() => {
      expect(trigger.querySelector('[data-slot="account-avatar"]')).toBeNull();
      expect(trigger.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe("JP");
    });
    expect(trigger.querySelectorAll("img")).toHaveLength(0);
    expect(trigger.getAttribute("aria-label")).toBe("Account menu for John Philip Morgan");
  });

  test("remounts the avatar fallback before loading a changed identity", async () => {
    const { trigger, view } = await renderAuthenticatedMenu();
    const previousUrl = trigger.querySelector('[data-slot="account-avatar"]')?.getAttribute("src");

    view.rerender(createElement(AuthenticatedUserMenu, menuProps(secondSession)));

    const nextTrigger = view.getByRole("button", { name: "Account menu for Ada Lovelace" });
    expect(nextTrigger.querySelector('[data-slot="account-avatar"]')).toBeNull();
    expect(nextTrigger.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe("AL");
    await waitFor(() =>
      expect(
        nextTrigger.querySelector('[data-slot="account-avatar"]')?.getAttribute("src"),
      ).not.toBe(previousUrl),
    );
  });

  test("keeps the popup open while logout is pending and recovers from a failed request", async () => {
    const pending = deferred();
    signOutMock.mockImplementationOnce(() => pending.promise);
    const { view } = await openAuthenticatedMenu();

    fireEvent.click(view.getByRole("menuitem", { name: "Logout" }));

    const pendingItem = await view.findByRole("menuitem", { name: "Logging out…" });
    expect(pendingItem.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toBeTruthy();

    await act(async () => {
      pending.reject(new Error("network failed"));
      await pending.promise.catch(() => {});
    });

    await waitFor(() => expect(reportErrorMock).toHaveBeenCalledWith("Could not log out."));
    expect(view.getByRole("menuitem", { name: "Logout" }).getAttribute("aria-disabled")).not.toBe(
      "true",
    );
  });

  test("supports keyboard logout activation and reports returned errors", async () => {
    signOutMock.mockResolvedValueOnce({ error: { message: "Session service is unavailable." } });
    const { view } = await openAuthenticatedMenu();
    const logout = view.getByRole("menuitem", { name: "Logout" });
    act(() => logout.focus());

    fireEvent.keyDown(logout, { key: "Enter" });

    await waitFor(() =>
      expect(reportErrorMock).toHaveBeenCalledWith("Session service is unavailable."),
    );
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(clearPrivateArtMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(view.getByRole("menuitem", { name: "Logout" })).toBeTruthy();
  });

  test("does not update state or report a pending failure after unmount", async () => {
    const pending = deferred();
    signOutMock.mockImplementationOnce(() => pending.promise);
    const { view } = await openAuthenticatedMenu();
    fireEvent.click(view.getByRole("menuitem", { name: "Logout" }));
    await view.findByRole("menuitem", { name: "Logging out…" });

    view.unmount();
    await act(async () => {
      pending.reject(new Error("offline"));
      await pending.promise.catch(() => {});
    });

    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  test("keeps initials markup stable through SSR hydration before loading the avatar", async () => {
    const element = createElement(
      StrictMode,
      null,
      createElement(AuthenticatedUserMenu, menuProps()),
    );
    const serverMarkup = renderToString(element);
    expect(serverMarkup).toContain('data-slot="avatar-fallback"');
    expect(serverMarkup).toContain(">JP</span>");
    expect(serverMarkup).not.toContain('data-slot="account-avatar"');

    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverableErrors = [];
    let root;

    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
      await Promise.resolve();
    });

    expect(recoverableErrors).toEqual([]);
    await waitFor(() =>
      expect(container.querySelector('[data-slot="account-avatar"]')).toBeTruthy(),
    );

    act(() => root.unmount());
    container.remove();
  });
});
