import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { siteRoutes } from "./routes";

const ROUTES_DIR = resolve(import.meta.dirname, "../../routes");

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.name === "+page.svelte") {
      const rel = full.slice(ROUTES_DIR.length).replace(/\\/g, "/").replace(/\/\+page\.svelte$/, "");
      found.push(rel === "" ? "/" : rel);
    }
  }
  return found;
}

describe("siteRoutes", () => {
  it("returns exactly the page routes found on disk, independently walked", () => {
    const expected = walk(ROUTES_DIR).sort();
    expect(siteRoutes()).toEqual(expected);
  });

  it("includes the home route as '/'", () => {
    expect(siteRoutes()).toContain("/");
  });

  it("includes nested routes with a leading slash and no trailing slash", () => {
    const routes = siteRoutes();
    for (const route of routes) {
      if (route === "/") continue;
      expect(route.startsWith("/")).toBe(true);
      expect(route.endsWith("/")).toBe(false);
    }
  });

  it("contains no duplicate routes", () => {
    const routes = siteRoutes();
    expect(new Set(routes).size).toBe(routes.length);
  });
});
