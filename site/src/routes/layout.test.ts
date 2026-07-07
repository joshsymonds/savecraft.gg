/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageStore = writable({ url: new URL("https://savecraft.gg/") });

vi.mock("$app/stores", () => ({
  page: pageStore,
}));

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
}));

const layoutModule = await import("./+layout.svelte");
const Layout = layoutModule.default;

const children = createRawSnippet(() => ({
  render: () => "<div data-testid='child'>child content</div>",
}));

function renderLayout(pathname: string, gameIds: string[]) {
  pageStore.set({ url: new URL(`https://savecraft.gg${pathname}`) });
  return render(Layout, { props: { data: { gameIds }, children } });
}

afterEach(cleanup);

describe("root layout wide derivation", () => {
  it("is wide on the homepage", () => {
    const { container } = renderLayout("/", ["magic", "poe", "rimworld"]);
    expect(container.querySelector(".nav-inner.wide")).not.toBeNull();
  });

  it("is wide on a game landing page discovered from plugin manifests", () => {
    const { container } = renderLayout("/rimworld", ["magic", "poe", "rimworld"]);
    expect(container.querySelector(".nav-inner.wide")).not.toBeNull();
  });

  it("is narrow on /games, which is not itself a game route", () => {
    const { container } = renderLayout("/games", ["magic", "poe", "rimworld"]);
    expect(container.querySelector(".nav-inner.wide")).toBeNull();
  });

  it("is narrow on a utility route not in the plugin manifest", () => {
    const { container } = renderLayout("/docs", ["magic", "poe", "rimworld"]);
    expect(container.querySelector(".nav-inner.wide")).toBeNull();
  });
});
