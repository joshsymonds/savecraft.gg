import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { authenticateApiKey, sha256Hex } from "../src/auth";
import worker from "../src/index";

import { cleanAll } from "./helpers";

const AUTH_TEST_USER = "auth-test-user";

describe("OAuth Discovery", () => {
  it("serves protected resource metadata at well-known endpoint", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-protected-resource");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported: string[];
    }>();

    expect(body.resource).toBe("https://test-host");
    expect(body.authorization_servers).toHaveLength(1);
    expect(body.bearer_methods_supported).toContain("header");
  });

  it("derives resource URL from request origin", async () => {
    const resp = await SELF.fetch("https://mcp.savecraft.gg/.well-known/oauth-protected-resource");
    expect(resp.status).toBe(200);

    const body = await resp.json<{ resource: string }>();
    expect(body.resource).toBe("https://mcp.savecraft.gg");
  });

  it("allows CORS on the discovery endpoint", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-protected-resource");
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OAuth Authorization Server Metadata", () => {
  it("issuer matches request origin (RFC 8414)", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-authorization-server");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
    }>();

    // RFC 8414: issuer MUST match the URL the metadata was fetched from
    expect(body.issuer).toBe("https://test-host");
    // Endpoints point to OUR domain (proxy), not Clerk
    expect(body.authorization_endpoint).toBe("https://test-host/oauth/authorize");
    expect(body.token_endpoint).toBe("https://test-host/oauth/token");
    expect(body.registration_endpoint).toBe("https://test-host/oauth/register");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("also serves under openid-configuration path", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/openid-configuration");
    expect(resp.status).toBe(200);
    const body = await resp.json<{ issuer: string }>();
    expect(body.issuer).toBe("https://test-host");
  });

  it("allows CORS on the AS metadata endpoint", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-authorization-server");
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// -- OAuth Proxy Endpoints (stub mode) ------------------------------------

describe("OAuth Proxy - DCR", () => {
  it("registers a client and returns client_id", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Test Client",
          redirect_uris: ["https://example.com/callback"],
          grant_types: ["authorization_code"],
          response_types: ["code"],
        }),
      }),
    );
    expect(resp.status).toBe(201);

    const body = await resp.json<{
      client_id: string;
      client_name: string;
      redirect_uris: string[];
    }>();
    expect(body.client_id).toBeDefined();
    expect(body.client_name).toBe("Test Client");
    expect(body.redirect_uris).toContain("https://example.com/callback");
  });

  it("allows CORS on DCR endpoint", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "CORS Test",
          redirect_uris: ["https://example.com/cb"],
        }),
      }),
    );
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OAuth Proxy - Authorize", () => {
  it("redirects to redirect_uri with code and state", async () => {
    const resp = await SELF.fetch(
      new Request(
        "https://test-host/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&state=abc123&code_challenge=xyz&code_challenge_method=S256",
        { redirect: "manual" },
      ),
    );
    expect(resp.status).toBe(302);

    const location = new URL(resp.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://example.com/callback");
    expect(location.searchParams.get("state")).toBe("abc123");
    expect(location.searchParams.get("code")).toBeDefined();
  });

  it("strips scope parameter before redirecting to Clerk", async () => {
    const fakeEnv = { ...env, CLERK_ISSUER: "https://fake-clerk.example.com" } as typeof env;
    const resp = await worker.fetch(
      new Request(
        "https://test-host/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&state=abc123&scope=openid+profile+email&code_challenge=xyz&code_challenge_method=S256",
        { redirect: "manual" },
      ),
      fakeEnv,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(302);

    const location = new URL(resp.headers.get("Location")!);
    expect(location.origin).toBe("https://fake-clerk.example.com");
    expect(location.pathname).toBe("/oauth/authorize");
    expect(location.searchParams.get("scope")).toBeNull();
    expect(location.searchParams.get("client_id")).toBe("test-client");
    expect(location.searchParams.get("state")).toBe("abc123");
    expect(location.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
  });
});

describe("OAuth Proxy - Token", () => {
  it("exchanges code for access token", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "stub-code",
          redirect_uri: "https://example.com/callback",
          client_id: "test-client",
          code_verifier: "test-verifier",
        }),
      }),
    );
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      access_token: string;
      token_type: string;
    }>();
    expect(body.access_token).toBeDefined();
    expect(body.token_type).toBe("Bearer");
  });

  it("allows CORS on token endpoint", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "stub",
          client_id: "test",
        }),
      }),
    );
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("MCP Subdomain Routing", () => {
  it("routes root path to MCP handler on mcp.* hosts", async () => {
    const resp = await SELF.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-user-uuid",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    expect(resp.status).toBe(200);

    const body = await resp.json<{ result: { serverInfo: unknown } }>();
    expect(body.result.serverInfo).toBeDefined();
  });

  it("routes root path to MCP handler on mcp-staging.* hosts", async () => {
    const resp = await SELF.fetch(
      new Request("https://mcp-staging.savecraft.gg/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-user-uuid",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    expect(resp.status).toBe(200);

    const body = await resp.json<{ result: { serverInfo: unknown } }>();
    expect(body.result.serverInfo).toBeDefined();
  });

  it("does not route root path to MCP on non-mcp hosts", async () => {
    const resp = await SELF.fetch(
      new Request("https://api.savecraft.gg/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-user-uuid",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    expect(resp.status).toBe(404);
  });

  it("returns 401 with correct origin in WWW-Authenticate on mcp subdomain", async () => {
    const resp = await SELF.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    expect(resp.status).toBe(401);

    const wwwAuth = resp.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("https://mcp.savecraft.gg/.well-known/oauth-protected-resource");
  });
});

describe("MCP Auth", () => {
  it("returns 401 with WWW-Authenticate header for unauthenticated MCP requests", async () => {
    const resp = await SELF.fetch("https://test-host/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(resp.status).toBe(401);

    const wwwAuth = resp.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("/.well-known/oauth-protected-resource");
  });

  it("accepts Bearer token auth in stub mode", async () => {
    const resp = await SELF.fetch("https://test-host/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-user-uuid",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(resp.status).toBe(200);
  });
});

// -- API Key Auth Functions -----------------------------------------------

describe("authenticateApiKey", () => {
  beforeEach(cleanAll);

  it("returns user UUID when valid API key hash found in D1", async () => {
    const rawKey = "sav_abc123def456";
    const hash = await sha256Hex(rawKey);
    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_prefix, key_hash, user_uuid, label) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("key-1", "sav_abc1", hash, AUTH_TEST_USER, "test key")
      .run();

    const result = await authenticateApiKey(rawKey, env.DB);
    expect(result).toEqual({ userUuid: AUTH_TEST_USER });
  });

  it("returns null when key not found", async () => {
    const result = await authenticateApiKey("sav_nonexistent", env.DB);
    expect(result).toBeNull();
  });

  it("returns null when token is empty", async () => {
    const result = await authenticateApiKey("", env.DB);
    expect(result).toBeNull();
  });

  it("hashes token with SHA-256 before D1 lookup", async () => {
    const rawKey = "sav_hashcheck";
    const hash = await sha256Hex(rawKey);

    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_prefix, key_hash, user_uuid, label) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("key-2", "sav_hash", hash, AUTH_TEST_USER, "hash test")
      .run();

    const result = await authenticateApiKey(rawKey, env.DB);
    expect(result).not.toBeNull();

    const badResult = await authenticateApiKey(hash, env.DB);
    expect(badResult).toBeNull();
  });
});

// -- API Key Auth Integration (push endpoint) -----------------------------

describe("API key auth integration", () => {
  beforeEach(cleanAll);

  it("push endpoint with valid API key returns 201", async () => {
    const rawKey = "sav_pushtest123456789012345678";
    const hash = await sha256Hex(rawKey);
    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_prefix, key_hash, user_uuid, label) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("key-push", "sav_push", hash, AUTH_TEST_USER, "push test")
      .run();

    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rawKey}`,
          "X-Game": "d2r",
          "X-Parsed-At": "2026-02-25T21:30:00Z",
        },
        body: JSON.stringify({
          identity: { saveName: "ApiKeyChar", gameId: "d2r" },
          summary: "Test character",
          sections: { overview: { description: "test", data: {} } },
        }),
      }),
    );
    expect(resp.status).toBe(201);
  });

  it("push endpoint without any auth returns 401", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Game": "d2r",
        },
        body: JSON.stringify({
          identity: { saveName: "Test", gameId: "d2r" },
          summary: "Test",
          sections: { overview: { description: "test", data: {} } },
        }),
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("authenticateApiKey rejects revoked key at function level", async () => {
    const rawKey = "sav_revokedkey1234567890123456";
    const hash = await sha256Hex(rawKey);

    await env.DB.prepare(
      "INSERT INTO api_keys (id, key_prefix, key_hash, user_uuid, label) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("key-revoke", "sav_revo", hash, AUTH_TEST_USER, "revoke test")
      .run();
    await env.DB.prepare("DELETE FROM api_keys WHERE id = ?").bind("key-revoke").run();

    const result = await authenticateApiKey(rawKey, env.DB);
    expect(result).toBeNull();
  });

  it("authenticateApiKey rejects garbage token at function level", async () => {
    const result = await authenticateApiKey("garbage_not_a_real_key", env.DB);
    expect(result).toBeNull();
  });
});
