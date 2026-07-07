/**
 * Enumerates the site's page routes by globbing +page.svelte files under
 * src/routes. Picks up new routes automatically as they're added.
 */
export function siteRoutes(): string[] {
  const modules = import.meta.glob("/src/routes/**/+page.svelte");
  return Object.keys(modules)
    .map((path) => {
      const pathname = path.replace(/^\/src\/routes/, "").replace(/\/\+page\.svelte$/, "");
      return pathname === "" ? "/" : pathname;
    })
    .sort();
}
