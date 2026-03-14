import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGoto = vi.fn();

vi.mock("$app/navigation", () => ({
  goto: (...args: unknown[]) => mockGoto(...args),
}));

vi.mock("$app/state", () => ({
  page: {
    params: { code: "482913" },
    url: new URL("https://app.savecraft.gg/link/482913"),
  },
}));

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$app/paths", () => ({
  resolve: (path: string) => path,
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
}));

const linkPageModule = await import("./+page.svelte");
const LinkPage = linkPageModule.default;

describe("/link/[code] route", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGoto.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes link code to localStorage and redirects to /", async () => {
    render(LinkPage);

    await vi.waitFor(() => {
      expect(localStorage.getItem("savecraft:linkCode")).toBe("482913");
    });
    expect(mockGoto).toHaveBeenCalledWith("/");
  });
});
