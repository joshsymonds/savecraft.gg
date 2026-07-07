import { execFileSync } from "child_process";
import { chromium } from "playwright";

function findChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  for (const c of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try {
      const p = execFileSync("which", [c], { encoding: "utf-8" }).trim();
      if (p) return p;
    } catch { /* next */ }
  }
  return undefined;
}

const OUT = "/home/joshsymonds/.claude/jobs/8610f588/tmp/shots";
const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:4199";
const pages = (process.env.SHOT_PAGES ?? "poe,magic").split(",");

const main = async () => {
  const browser = await chromium.launch({ executablePath: findChromium() });
  for (const [w, h, tag] of [[1440, 2400, "desktop"], [390, 1600, "mobile"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    for (const slug of pages) {
      await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-top.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-mid.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${slug}-${tag}-bottom.png` });
    }
    await ctx.close();
  }
  await browser.close();
  console.log("done");
};
main();
