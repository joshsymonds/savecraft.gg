/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_APP_URL: "https://test-app.savecraft.gg",
  PUBLIC_API_URL: "https://test-api.savecraft.gg",
}));

import Page from "./+page.svelte";

afterEach(cleanup);

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Requested games page", () => {
  it("sets the document title", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ requests: [] }))),
    );
    render(Page);
    expect(document.title).toContain("Requested Games");
  });

  it("renders the ranked list from the fetched payload, preserving order", async () => {
    const payload = {
      requests: [
        { slug: "elden-ring", name: "Elden Ring", count: 42 },
        { slug: "hades-2", name: "Hades II", count: 17 },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));

    const { findByText, container } = render(Page);

    await findByText("Elden Ring");
    expect(container.textContent).toContain("42 players");
    expect(container.textContent).toContain("Hades II");
    expect(container.textContent).toContain("17 players");

    const names = Array.from(container.querySelectorAll(".request-name")).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(["Elden Ring", "Hades II"]);
  });

  it("singularizes the count for a game with exactly one requester", async () => {
    const payload = {
      requests: [{ slug: "hollow-knight-2", name: "Hollow Knight: Silksong", count: 1 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));

    const { findByText, container } = render(Page);

    await findByText("Hollow Knight: Silksong");
    const countEl = container.querySelector(".request-count");
    expect(countEl?.textContent).toBe("1 player");
    expect(countEl?.textContent).not.toBe("1 players");
  });

  it("shows a quiet error state when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { findByText } = render(Page);

    await findByText("Tallies are unavailable right now.");
  });

  it("shows an empty state when there are no requests yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ requests: [] }))),
    );

    const { findByText } = render(Page);

    await findByText("No requests yet — be the first: ask your AI to request your game.");
  });

  it("ships social meta pointing at the requests OG card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ requests: [] }))),
    );

    render(Page);

    await waitFor(() => {
      expect(
        document.head.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      ).toBe("https://savecraft.gg/og/requests.png");
    });
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/requests",
    );
  });
});
