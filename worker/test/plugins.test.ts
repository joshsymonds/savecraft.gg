import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("Plugin Registry", () => {
  beforeEach(cleanAll);

  it("returns empty manifest when no plugins exist", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/plugins/manifest");
    expect(resp.status).toBe(200);

    const body = await resp.json<{ plugins: Record<string, unknown> }>();
    expect(body.plugins).toEqual({});
  });

  it("returns plugin manifest from R2", async () => {
    // Seed a plugin manifest in R2
    const d2rManifest = {
      game_id: "d2r",
      game_name: "Diablo II: Resurrected",
      version: "1.0.0",
      sha256: "abc123def456",
    };
    await env.SNAPSHOTS.put("plugins/d2r/manifest.json", JSON.stringify(d2rManifest));

    const resp = await SELF.fetch("https://test-host/api/v1/plugins/manifest");
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      plugins: Record<string, { version: string; sha256: string; url: string }>;
    }>();
    expect(body.plugins.d2r).toBeDefined();
    expect(body.plugins.d2r!.version).toBe("1.0.0");
    expect(body.plugins.d2r!.sha256).toBe("abc123def456");
    expect(body.plugins.d2r!.url).toContain("d2r/parser.wasm");
  });

  it("returns multiple plugins", async () => {
    await env.SNAPSHOTS.put(
      "plugins/d2r/manifest.json",
      JSON.stringify({ game_id: "d2r", version: "1.0.0", sha256: "abc" }),
    );
    await env.SNAPSHOTS.put(
      "plugins/stardew/manifest.json",
      JSON.stringify({ game_id: "stardew", version: "2.0.0", sha256: "def" }),
    );

    const resp = await SELF.fetch("https://test-host/api/v1/plugins/manifest");
    expect(resp.status).toBe(200);

    const body = await resp.json<{ plugins: Record<string, unknown> }>();
    expect(Object.keys(body.plugins)).toHaveLength(2);
  });

  it("does not require authentication", async () => {
    // No Authorization header
    const resp = await SELF.fetch("https://test-host/api/v1/plugins/manifest");
    expect(resp.status).toBe(200);
  });
});
