import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/auth/clerk", () => ({
  getToken: vi.fn(),
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
}));

const { getToken } = await import("$lib/auth/clerk");
const { linkSource, fetchOAuthAuthorizeUrl } = await import("./client");

describe("fetchOAuthAuthorizeUrl", () => {
  beforeEach(() => {
    vi.mocked(getToken).mockResolvedValue("test-token");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hits the provider-specific authorize route, not a hardcoded one", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ url: "https://ggg.example/oauth" }), { status: 200 }),
    );

    const url = await fetchOAuthAuthorizeUrl("ggg", "pc");

    const calledWith = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(calledWith).toContain("https://api.test/oauth/ggg/authorize?region=pc");
    expect(calledWith).not.toContain("/oauth/battlenet/");
    expect(url).toBe("https://ggg.example/oauth");
  });

  it("uses the battlenet route for the wow provider", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ url: "https://bnet.example/oauth" }), { status: 200 }),
    );

    await fetchOAuthAuthorizeUrl("battlenet", "us");

    const calledWith = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(calledWith).toContain("https://api.test/oauth/battlenet/authorize?region=us");
  });
});

describe("linkSource", () => {
  beforeEach(() => {
    vi.mocked(getToken).mockResolvedValue("test-token");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/v1/source/link with code and auth", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ source_uuid: "dev-123" }), { status: 200 }),
    );

    const result = await linkSource("482913");

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.test/api/v1/source/link", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: "482913" }),
    });
    expect(result).toEqual({ source_uuid: "dev-123" });
  });

  it("throws on 404 (invalid or expired code)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Invalid or expired code", { status: 404 }),
    );

    await expect(linkSource("999999")).rejects.toThrow("Invalid or expired code");
  });

  it("throws on 400 (malformed code)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("Invalid code", { status: 400 }));

    await expect(linkSource("abc")).rejects.toThrow("Invalid code");
  });

  it("throws on 401 when not authenticated", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    await expect(linkSource("482913")).rejects.toThrow("Not authenticated");
  });
});
