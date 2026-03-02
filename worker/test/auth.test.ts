import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { authenticateApiKey, sha256Hex } from "../src/auth";

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
      scopes_supported: string[];
    }>();

    expect(body.resource).toBe("https://test-host");
    expect(body.authorization_servers).toHaveLength(1);
    expect(body.bearer_methods_supported).toContain("header");
    expect(body.scopes_supported).toContain("savecraft:read");
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
  it("serves AS metadata at well-known endpoint (stub mode)", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-authorization-server");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
    }>();

    expect(body.issuer).toBeDefined();
    expect(body.authorization_endpoint).toContain("/oauth/authorize");
    expect(body.token_endpoint).toContain("/oauth/token");
    expect(body.registration_endpoint).toContain("/oauth/register");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("allows CORS on the AS metadata endpoint", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-authorization-server");
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
