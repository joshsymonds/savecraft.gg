import { siteRoutes } from "$lib/server/routes";

export const prerender = true;

const ORIGIN = "https://savecraft.gg";

export function GET() {
  const urls = siteRoutes()
    .map((pathname) => `  <url><loc>${ORIGIN}${pathname}</loc></url>`)
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}
