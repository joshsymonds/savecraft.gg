import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../src/index";

const MCP_ENV = {
  ...env,
  MCP_HOSTNAME: "mcp.savecraft.gg",
  WEB_URL: "https://my.savecraft.gg",
} as typeof env;

describe("MCP browser redirect", () => {
  it("returns HTML with OG tags and redirect for browser GET on MCP host", async () => {
    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
      }),
      MCP_ENV,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("text/html");

    const body = await resp.text();
    expect(body).toContain("og:title");
    expect(body).toContain("og:description");
    expect(body).toContain("og:url");
    expect(body).toContain("my.savecraft.gg/connect");
    expect(body).toContain('http-equiv="refresh"');
  });

  it("returns HTML with OG tags for browser GET on /mcp path", async () => {
    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/mcp", {
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
      }),
      MCP_ENV,
      {} as ExecutionContext,
    );

    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain("og:title");
    expect(body).toContain("my.savecraft.gg/connect");
  });

  it("does not intercept POST requests", async () => {
    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/html",
        },
        body: "{}",
      }),
      MCP_ENV,
      {} as ExecutionContext,
    );

    // POST without auth should hit the OAuth layer and get 401, not our HTML page
    expect(resp.status).not.toBe(200);
    const body = await resp.text();
    expect(body).not.toContain("og:title");
  });

  it("does not intercept non-browser GET (Accept: application/json)", async () => {
    const resp = await worker.fetch(
      new Request("https://mcp.savecraft.gg/", {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      MCP_ENV,
      {} as ExecutionContext,
    );

    // Non-browser GET should pass through to normal auth flow
    const body = await resp.text();
    expect(body).not.toContain("og:title");
  });

  it("does not intercept browser GET on non-MCP host", async () => {
    const resp = await worker.fetch(
      new Request("https://api.savecraft.gg/mcp", {
        method: "GET",
        headers: { Accept: "text/html" },
      }),
      MCP_ENV,
      {} as ExecutionContext,
    );

    // Should pass through to normal routing (not our HTML page)
    expect(resp.status).not.toBe(200);
  });
});
