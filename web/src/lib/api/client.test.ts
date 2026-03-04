import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/auth/clerk", () => ({
  getToken: vi.fn(),
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
}));

const { getToken } = await import("$lib/auth/clerk");
const { linkDevice } = await import("./client");

describe("linkDevice", () => {
  beforeEach(() => {
    vi.mocked(getToken).mockResolvedValue("test-token");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/v1/device/link with code and auth", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ device_uuid: "dev-123" }), { status: 200 }),
    );

    const result = await linkDevice("482913");

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.test/api/v1/device/link", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: "482913" }),
    });
    expect(result).toEqual({ device_uuid: "dev-123" });
  });

  it("includes email and display_name when provided", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ device_uuid: "dev-123" }), { status: 200 }),
    );

    await linkDevice("482913", "user@example.com", "Josh");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.test/api/v1/device/link",
      expect.objectContaining({
        body: JSON.stringify({ code: "482913", email: "user@example.com", display_name: "Josh" }),
      }),
    );
  });

  it("throws on 404 (invalid or expired code)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Invalid or expired code", { status: 404 }),
    );

    await expect(linkDevice("999999")).rejects.toThrow("Invalid or expired code");
  });

  it("throws on 400 (malformed code)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("Invalid code", { status: 400 }));

    await expect(linkDevice("abc")).rejects.toThrow("Invalid code");
  });

  it("throws on 401 when not authenticated", async () => {
    vi.mocked(getToken).mockResolvedValue(null);

    await expect(linkDevice("482913")).rejects.toThrow("Not authenticated");
  });
});
