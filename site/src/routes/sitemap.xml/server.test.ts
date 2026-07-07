import { describe, it, expect } from "vitest";
import { siteRoutes } from "$lib/server/routes";
import { GET } from "./+server";

describe("GET /sitemap.xml", () => {
  it("returns parseable XML using the sitemap urlset namespace", async () => {
    const res = GET();
    const body = await res.text();
    const doc = new DOMParser().parseFromString(body, "application/xml");
    const parseErrors = doc.getElementsByTagName("parsererror");
    expect(parseErrors.length).toBe(0);
    const urlset = doc.documentElement;
    expect(urlset.tagName).toBe("urlset");
    expect(urlset.getAttribute("xmlns")).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");
  });

  it("emits one absolute URL per page route derived from the filesystem", async () => {
    const res = GET();
    const body = await res.text();
    const doc = new DOMParser().parseFromString(body, "application/xml");
    const locs = Array.from(doc.getElementsByTagName("loc")).map((node) => node.textContent);

    const expectedRoutes = siteRoutes();
    expect(locs).toHaveLength(expectedRoutes.length);
    for (const route of expectedRoutes) {
      expect(locs).toContain(`https://savecraft.gg${route}`);
    }
  });

  it("serves XML content type", () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("xml");
  });
});
