import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("Daemon routes", () => {
  beforeEach(cleanAll);

  it("GET /api/v1/daemon/manifest returns manifest from R2", async () => {
    const manifest = {
      version: "0.2.0",
      platforms: {
        "linux-amd64": {
          url: "https://api.savecraft.gg/daemon/savecraft-daemon-linux-amd64",
          sha256: "abc123",
          signatureUrl: "https://api.savecraft.gg/daemon/savecraft-daemon-linux-amd64.sig",
        },
      },
    };
    await env.PLUGINS.put("daemon/manifest.json", JSON.stringify(manifest));

    const resp = await SELF.fetch("https://test-host/api/v1/daemon/manifest");
    expect(resp.status).toBe(200);

    const body = await resp.json<typeof manifest>();
    expect(body.version).toBe("0.2.0");
    expect(body.platforms["linux-amd64"].sha256).toBe("abc123");
  });

  it("GET /api/v1/daemon/manifest returns 404 when no manifest", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/daemon/manifest");
    expect(resp.status).toBe(404);
  });

  it("GET /daemon/:filename serves binary from R2", async () => {
    const binaryContent = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]); // ELF magic
    await env.PLUGINS.put("daemon/savecraft-daemon-linux-amd64", binaryContent);

    const resp = await SELF.fetch("https://test-host/daemon/savecraft-daemon-linux-amd64");
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/octet-stream");

    const body = new Uint8Array(await resp.arrayBuffer());
    expect(body).toEqual(binaryContent);
  });

  it("GET /daemon/:filename returns 404 for missing binary", async () => {
    const resp = await SELF.fetch("https://test-host/daemon/nonexistent");
    expect(resp.status).toBe(404);
  });
});
