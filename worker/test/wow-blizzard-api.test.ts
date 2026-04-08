import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../src/types";
import {
  BlizzardApiError,
  blizzardFetch,
  getAppToken,
  resetTokenCache,
} from "../../plugins/wow/shared/blizzard-api";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeEnv(overrides?: Partial<Env>): Env {
  return {
    BATTLENET_CLIENT_ID: "test-client-id",
    BATTLENET_CLIENT_SECRET: "test-client-secret",
    BATTLENET_REGION: "us",
    ...overrides,
  } as unknown as Env;
}

function fakeTokenResponse(token = "fake-token", expiresIn = 86400): Response {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn }),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getAppToken", () => {
  beforeEach(() => {
    resetTokenCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a new token and returns it", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(fakeTokenResponse("my-token"));
    vi.stubGlobal("fetch", mockFetch);

    const token = await getAppToken(fakeEnv());

    expect(token).toBe("my-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://oauth.battle.net/token");
    expect(init.method).toBe("POST");
    expect(init.body.get("grant_type")).toBe("client_credentials");
    expect(init.body.get("client_id")).toBe("test-client-id");
  });

  it("returns cached token on second call", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(fakeTokenResponse("cached-token"));
    vi.stubGlobal("fetch", mockFetch);

    const env = fakeEnv();
    const first = await getAppToken(env);
    const second = await getAppToken(env);

    expect(first).toBe("cached-token");
    expect(second).toBe("cached-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses APAC token URL for KR region", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(fakeTokenResponse());
    vi.stubGlobal("fetch", mockFetch);

    await getAppToken(fakeEnv({ BATTLENET_REGION: "kr" }));

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://apac.oauth.battle.net/token");
  });

  it("throws BlizzardApiError on non-200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(getAppToken(fakeEnv())).rejects.toThrow(BlizzardApiError);
  });

  it("throws BlizzardApiError when access_token is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await getAppToken(fakeEnv());
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BlizzardApiError);
      expect((e as BlizzardApiError).message).toMatch(/missing access_token/);
    }
  });
});

describe("blizzardFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Bearer header and parses JSON response", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "Thrall" }), {
        status: 200,
        headers: { "Last-Modified": "Mon, 01 Jan 2024 00:00:00 GMT" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await blizzardFetch<{ name: string }>(
      "https://us.api.blizzard.com/test",
      "my-token",
    );

    expect(result.data).toEqual({ name: "Thrall" });
    expect(result.lastModified).toBe("Mon, 01 Jan 2024 00:00:00 GMT");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers.Authorization).toBe("Bearer my-token");
  });

  it("returns null lastModified when header is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await blizzardFetch("https://example.com/api", "token");
    expect(result.lastModified).toBeNull();
  });

  it("throws BlizzardApiError with status on non-200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await blizzardFetch("https://us.api.blizzard.com/missing", "token");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BlizzardApiError);
      expect((e as BlizzardApiError).status).toBe(404);
    }
  });

  it("throws BlizzardApiError on rate limit (429)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response("Rate Limited", { status: 429 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    try {
      await blizzardFetch("https://us.api.blizzard.com/test", "token");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BlizzardApiError);
      expect((e as BlizzardApiError).status).toBe(429);
    }
  });
});
