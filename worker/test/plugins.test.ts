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

  it("passes through all manifest fields from R2", async () => {
    const d2rManifest = {
      game_id: "d2r",
      name: "Diablo II: Resurrected",
      description: "Parses .d2s character save files",
      version: "0.1.0",
      channel: "beta",
      coverage: "partial",
      sha256: "abc123def456",
      file_extensions: [".d2s"],
      homepage: "https://savecraft.gg/plugins/d2r",
      limitations: ["Shared stash not supported"],
      author: { name: "Josh Symonds", github: "joshsymonds" },
      default_paths: {
        windows: "%USERPROFILE%/Saved Games/Diablo II Resurrected",
        linux: "~/.local/share/Diablo II Resurrected",
        darwin: "~/Library/Application Support/Diablo II Resurrected",
      },
    };
    await env.SNAPSHOTS.put("plugins/d2r/manifest.json", JSON.stringify(d2rManifest));

    const resp = await SELF.fetch("https://test-host/api/v1/plugins/manifest");
    expect(resp.status).toBe(200);

    const body = await resp.json<{ plugins: Record<string, Record<string, unknown>> }>();
    const d2r = body.plugins.d2r!;
    expect(d2r.game_id).toBe("d2r");
    expect(d2r.name).toBe("Diablo II: Resurrected");
    expect(d2r.description).toBe("Parses .d2s character save files");
    expect(d2r.version).toBe("0.1.0");
    expect(d2r.channel).toBe("beta");
    expect(d2r.coverage).toBe("partial");
    expect(d2r.sha256).toBe("abc123def456");
    expect(d2r.file_extensions).toEqual([".d2s"]);
    expect(d2r.homepage).toBe("https://savecraft.gg/plugins/d2r");
    expect(d2r.limitations).toEqual(["Shared stash not supported"]);
    expect(d2r.author).toEqual({ name: "Josh Symonds", github: "joshsymonds" });
    expect(d2r.default_paths).toEqual({
      windows: "%USERPROFILE%/Saved Games/Diablo II Resurrected",
      linux: "~/.local/share/Diablo II Resurrected",
      darwin: "~/Library/Application Support/Diablo II Resurrected",
    });
    // url is always injected by the endpoint
    expect(d2r.url).toContain("d2r/parser.wasm");
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
