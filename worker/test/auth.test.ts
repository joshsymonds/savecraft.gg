import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { authenticateApiKey, sha256Hex } from "../src/auth";
import worker from "../src/index";

import { cleanAll, getOAuthToken } from "./helpers";

const AUTH_TEST_USER = "auth-test-user";

// -- Library-managed metadata endpoints ---------------------------------------

describe("OAuth Discovery", () => {
  it("serves protected resource metadata", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-protected-resource");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      resource: string;
      authorization_servers: string[];
    }>();

    // Trailing slash on resource is required: MCP clients send resource=https://host/
    // in authorize requests, and RFC 8707 uses exact string comparison.
    expect(body.resource).toBe("https://test-host/");
    expect(body.authorization_servers).toEqual(["https://test-host"]);
  });

  it("serves AS metadata with our domain as issuer", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-authorization-server");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
    }>();

    expect(body.issuer).toBe("https://test-host");
    expect(body.authorization_endpoint).toBe("https://test-host/oauth/authorize");
    expect(body.token_endpoint).toBe("https://test-host/oauth/token");
    expect(body.registration_endpoint).toBe("https://test-host/oauth/register");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });
});

// -- Library-managed DCR endpoint ---------------------------------------------

describe("OAuth DCR", () => {
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
});

// -- Our authorize handler (Clerk delegation) ---------------------------------

describe("OAuth Authorize", () => {
  it("returns 503 when Clerk is not configured", async () => {
    const resp = await SELF.fetch(
      new Request(
        "https://test-host/oauth/authorize?response_type=code&client_id=test&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&state=abc&code_challenge=xyz&code_challenge_method=S256",
        { redirect: "manual" },
      ),
    );
    expect(resp.status).toBe(503);

    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("Clerk OAuth not configured");
  });
});

// -- MCP Auth (library token validation) --------------------------------------

describe("MCP Auth", () => {
  it("returns 401 for unauthenticated MCP requests", async () => {
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

  it("accepts valid OAuth token and returns MCP response", async () => {
    const token = await getOAuthToken(AUTH_TEST_USER);

    const resp = await SELF.fetch("https://test-host/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
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

  it("rejects invalid Bearer token", async () => {
    const resp = await SELF.fetch("https://test-host/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer totally-fake-token",
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
    expect(resp.status).toBe(401);
  });
});

// -- MCP Subdomain Routing ----------------------------------------------------

describe("MCP Subdomain Routing", () => {
  it("routes root path to MCP handler when hostname matches MCP_HOSTNAME", async () => {
    const token = await getOAuthToken("subdomain-test-user");
    const fakeEnv = { ...env, MCP_HOSTNAME: "mcp.savecraft.gg" } as typeof env;

    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
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
      fakeEnv,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });

  it("does not route root path to MCP on non-MCP hosts", async () => {
    const fakeEnv = { ...env, MCP_HOSTNAME: "mcp.savecraft.gg" } as typeof env;
    const resp = await worker.fetch(
      new Request("https://api.savecraft.gg/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      }),
      fakeEnv,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(404);
  });

  it("does not route root path to MCP when MCP_HOSTNAME is unset", async () => {
    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(404);
  });

  it("returns 401 on mcp subdomain without auth", async () => {
    const fakeEnv = { ...env, MCP_HOSTNAME: "mcp.savecraft.gg" } as typeof env;
    const resp = await worker.fetch(
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
      fakeEnv,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });
});

// -- API Key Auth Functions ---------------------------------------------------

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

// -- API Key Auth Unit Tests --------------------------------------------------

describe("API key auth unit tests", () => {
  beforeEach(cleanAll);

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
