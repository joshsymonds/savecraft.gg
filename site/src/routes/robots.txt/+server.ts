export const prerender = true;

export function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: https://savecraft.gg/sitemap.xml\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
