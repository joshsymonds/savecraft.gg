/**
 * Screenshot utility for capturing views Storybook components.
 *
 * Usage:
 *   npx tsx scripts/screenshot.ts --grep <pattern>    # filter by substring/regex
 *   npx tsx scripts/screenshot.ts --all               # every story
 *   npx tsx scripts/screenshot.ts <story-id> ...      # specific stories
 *
 * Options:
 *   --port <number>       Storybook port (default: 6007)
 *   --globals <key:val>   Storybook globals to set (e.g., theme:light)
 *   --suffix <string>     Append to screenshot filename (e.g., -light)
 *
 * Examples:
 *   npx tsx scripts/screenshot.ts --grep ManaPip
 *   npx tsx scripts/screenshot.ts --grep "mana|card"
 *   npx tsx scripts/screenshot.ts --all
 *   npx tsx scripts/screenshot.ts --all --globals theme:light --suffix -light
 *
 * Output: screenshots/<story-path>.png
 */

import { execFileSync } from "child_process";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, "..", "screenshots");

function findChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  for (const cmd of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try {
      const path = execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
      if (path) return path;
    } catch {
      // not found, try next
    }
  }

  return undefined;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 6007;
  let globals: string | undefined;
  let suffix: string | undefined;
  const ids: string[] = [];
  let mode: "all" | "grep" | "ids" = "ids";
  let pattern: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port") port = Number(args[++i]);
    else if (arg === "--globals") globals = args[++i];
    else if (arg === "--suffix") suffix = args[++i];
    else if (arg === "--all") mode = "all";
    else if (arg === "--grep") { mode = "grep"; pattern = args[++i]; }
    else if (!arg.startsWith("-")) ids.push(arg);
  }

  if (mode === "ids" && ids.length === 0) {
    console.log("Usage:");
    console.log("  npx tsx scripts/screenshot.ts --grep <pattern>");
    console.log("  npx tsx scripts/screenshot.ts --all");
    console.log("  npx tsx scripts/screenshot.ts <story-id> ...");
    console.log("  --port <number>   Storybook port (default: 6007)");
    console.log("  --globals <k:v>   Storybook globals (e.g., theme:light)");
    console.log("  --suffix <str>    Append to filename (e.g., -light)");
    process.exit(1);
  }

  return { mode, port, globals, suffix, pattern, ids: ids.length > 0 ? ids : undefined };
}

async function getStoryIds(port: number): Promise<string[]> {
  const res = await fetch(`http://localhost:${port}/index.json`);
  const index = (await res.json()) as { entries: Record<string, { id: string; type: string }> };
  return Object.values(index.entries)
    .filter((e) => e.type === "story")
    .map((e) => e.id);
}

async function main() {
  const { mode, port, globals, suffix, pattern, ids } = parseArgs();

  let storyIds: string[];
  if (mode === "all") {
    storyIds = await getStoryIds(port);
  } else if (mode === "grep") {
    const all = await getStoryIds(port);
    const re = new RegExp(pattern!, "i");
    storyIds = all.filter((id) => re.test(id));
    if (storyIds.length === 0) {
      console.error(`No stories match: ${pattern}`);
      process.exit(1);
    }
  } else {
    storyIds = ids!;
  }

  await mkdir(screenshotsDir, { recursive: true });

  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chromium",
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  const globalsParam = globals ? `&globals=${encodeURIComponent(globals)}` : "";
  const filenameSuffix = suffix ?? "";

  console.log(`Capturing ${storyIds.length} ${storyIds.length === 1 ? "story" : "stories"}${globals ? ` (globals: ${globals})` : ""}\n`);

  for (const id of storyIds) {
    const url = `http://localhost:${port}/iframe.html?id=${id}&viewMode=story${globalsParam}`;
    console.log(`Capturing: ${id}${filenameSuffix}`);
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(screenshotsDir, `${id}${filenameSuffix}.png`), fullPage: true });
    } catch (err) {
      console.error(`  Failed: ${err}`);
    }
  }

  await browser.close();
  console.log(`\nDone! ${storyIds.length} screenshots in ${screenshotsDir}`);
}

void main();
