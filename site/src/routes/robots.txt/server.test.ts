import { describe, it, expect } from "vitest";
import { GET } from "./+server";

describe("GET /robots.txt", () => {
  it("allows all user agents", async () => {
    const res = GET();
    const body = await res.text();
    expect(body).toMatch(/User-agent:\s*\*/);
    expect(body).toMatch(/Allow:\s*\//);
  });

  it("points to the sitemap", async () => {
    const res = GET();
    const body = await res.text();
    expect(body).toContain("Sitemap: https://savecraft.gg/sitemap.xml");
  });

  it("serves plain text content type", () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
