/**
 * Capture MCP Apps view Storybook stories as marketing hero images.
 *
 * Usage:
 *   1. Start the views Storybook:  cd views && npm run storybook -- --ci
 *   2. Run this script:            cd web && npx tsx scripts/capture-view-heroes.ts --game rimworld
 *
 * Options:
 *   --game <name>     Required. Filters story IDs by prefix/substring (case-insensitive).
 *   --port <number>   Storybook port (default: 6007)
 *
 * Output: site/static/images/<game>/<story-name>.png
 *
 * Captures are clipped to the rendered view's bounding box (plus breathing
 * room) rather than the full viewport — Storybook centers small views in a
 * sea of empty canvas, and marketing frames need tight compositions.
 *
 * Every capture is checked against a 10KB size floor. A capture under the floor
 * usually means the view rendered blank (e.g., Storybook not fully loaded, or the
 * story crashed) — the script names the offending story and exits non-zero.
 */

import { execFileSync } from "child_process";
import { mkdir, stat } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const imagesRoot = join(__dirname, "..", "..", "site", "static", "images");

const BLANK_SIZE_FLOOR_BYTES = 10 * 1024;

/** Breathing room around the view's bounding box, in CSS pixels. */
const CLIP_PADDING = 28;

function findChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const candidates = [
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "google-chrome",
  ];
  for (const cmd of candidates) {
    try {
      const path = execFileSync("which", [cmd], { encoding: "utf-8" }).trim();
      if (path) return path;
    } catch {
      // Command not found, try next
    }
  }

  return undefined;
}

function parseArgs(): { game: string; port: number } {
  const args = process.argv.slice(2);
  let game: string | undefined;
  let port = 6007;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--game") {
      game = args[++index];
    } else if (arg === "--port") {
      port = Number(args[++index]);
    }
  }

  if (!game) {
    console.log("Usage:");
    console.log("  npx tsx scripts/capture-view-heroes.ts --game <name> [--port <number>]");
    console.log("");
    console.log("  --game <name>     Required. Filters story IDs by prefix/substring.");
    console.log("  --port <number>   Storybook port (default: 6007)");
    process.exit(1);
  }

  return { game, port };
}

async function getMatchingStoryIds(game: string, port: number): Promise<string[]> {
  const response = await fetch(`http://localhost:${String(port)}/index.json`);
  const index = (await response.json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  const needle = game.toLowerCase();
  return Object.values(index.entries)
    .filter((entry) => entry.type === "story" && entry.id.toLowerCase().includes(needle))
    .map((entry) => entry.id);
}

function storyFileName(storyId: string, game: string): string {
  const withoutGamePrefix = storyId.startsWith(`${game}-`) ? storyId.slice(game.length + 1) : storyId;
  return `${withoutGamePrefix.replaceAll("--", "-")}.png`;
}

async function captureStories(storyIds: string[], game: string, port: number): Promise<void> {
  const outputDir = join(imagesRoot, game);
  await mkdir(outputDir, { recursive: true });

  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chromium",
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 2,
  });

  console.log(`Capturing ${String(storyIds.length)} ${storyIds.length === 1 ? "story" : "stories"} for "${game}"\n`);

  const blanks: string[] = [];

  for (const storyId of storyIds) {
    const url = `http://localhost:${String(port)}/iframe.html?viewMode=story&id=${storyId}`;
    console.log(`Capturing: ${storyId}`);

    const outputPath = join(outputDir, storyFileName(storyId, game));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Clip to the rendered view, not the viewport: Storybook centers the
    // component in empty canvas, which reads as dead space in a hero frame.
    const box = await page.locator("#storybook-root").boundingBox();
    if (!box || box.width < 40 || box.height < 40) {
      console.error(`  NO RENDER: ${storyId} — #storybook-root missing or degenerate`);
      blanks.push(storyId);
      continue;
    }
    const viewport = page.viewportSize() ?? { width: 1100, height: 800 };
    const clipX = Math.max(0, box.x - CLIP_PADDING);
    const clipY = Math.max(0, box.y - CLIP_PADDING);
    const clip = {
      x: clipX,
      y: clipY,
      width: Math.min(viewport.width - clipX, box.width + CLIP_PADDING * 2),
      height: Math.min(viewport.height - clipY, box.height + CLIP_PADDING * 2),
    };
    await page.screenshot({ path: outputPath, clip });

    const { size } = await stat(outputPath);
    if (size < BLANK_SIZE_FLOOR_BYTES) {
      console.error(`  BLANK: ${storyId} captured only ${String(size)} bytes (floor: ${String(BLANK_SIZE_FLOOR_BYTES)})`);
      blanks.push(storyId);
    }
  }

  await browser.close();

  if (blanks.length > 0) {
    console.error(`\n${String(blanks.length)} of ${String(storyIds.length)} captures came back blank: ${blanks.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nDone! ${String(storyIds.length)} screenshots in ${outputDir}`);
}

async function main(): Promise<void> {
  const { game, port } = parseArgs();
  const storyIds = await getMatchingStoryIds(game, port);

  if (storyIds.length === 0) {
    console.error(`No stories match game: ${game}`);
    process.exit(1);
  }

  await captureStories(storyIds, game, port);
}

void main();
