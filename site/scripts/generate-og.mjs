// Generate OG card PNGs for the marketing pages.
//
// Renders scripts/og/template.html (which imports the site's design tokens)
// at 1200x630 via system chromium and writes static/og/<slug>.png.
// Output is gitignored — CI regenerates cards on every site build.
//
// Usage: node scripts/generate-og.mjs
// Set OG_CHROMIUM to override the chromium binary path.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

import { cards, OG_HEIGHT, OG_WIDTH } from "./og/cards.mjs";

const siteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const templateUrl = pathToFileURL(join(siteDir, "scripts/og/template.html"));
const outDir = join(siteDir, "static/og");

const CHROMIUM_CANDIDATES = [
  process.env.OG_CHROMIUM,
  "/run/current-system/sw/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].filter(Boolean);

const executablePath = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error(
    `generate-og: no chromium binary found (tried ${CHROMIUM_CANDIDATES.join(", ")}). ` +
      "Set OG_CHROMIUM to a chromium/chrome executable.",
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 1,
  });

  for (const card of cards) {
    const url = new URL(templateUrl);
    url.searchParams.set("eyebrow", card.eyebrow);
    url.searchParams.set("title", card.title);
    url.searchParams.set("shot", card.screenshot);

    await page.goto(url.href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const out = join(outDir, `${card.slug}.png`);
    await page.screenshot({ path: out });
    console.log(`generate-og: wrote ${out}`);
  }
} finally {
  await browser.close();
}
