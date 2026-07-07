// Capture a game page's demo-hero ConversationDemo panel as a marketing
// image (used for OG cards on pages without capture assets).
// Usage: SHOT_PAGE=wow SHOT_OUT=season-check-demo.png npx tsx scripts/shot-demo-panel.ts
import { execFileSync } from "child_process";
import { chromium } from "playwright";
function findChromium(): string | undefined {
  for (const c of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try { const p = execFileSync("which", [c], { encoding: "utf-8" }).trim(); if (p) return p; } catch { /* next */ }
  }
  return undefined;
}
const page_ = process.env.SHOT_PAGE;
const out = process.env.SHOT_OUT;
if (!page_ || !out) { console.error("SHOT_PAGE and SHOT_OUT required"); process.exit(1); }
const main = async () => {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:4199/${page_}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(9000); // let the demo conversation finish typing
  await page.locator(".demo-hero-panel").screenshot({ path: `../site/static/images/${page_}/${out}` });
  await browser.close();
  console.log("captured");
};
main();
