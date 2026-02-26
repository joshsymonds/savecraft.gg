import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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

    expect(body.authorization_servers).toHaveLength(1);
    expect(body.bearer_methods_supported).toContain("header");
    expect(body.scopes_supported).toContain("savecraft:read");
  });

  it("allows CORS on the discovery endpoint", async () => {
    const resp = await SELF.fetch("https://test-host/.well-known/oauth-protected-resource");
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
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
