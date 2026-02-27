/**
 * Screenshot utility for capturing Storybook components
 *
 * Usage:
 *   npx tsx scripts/screenshot.ts [story-path]
 *   npx tsx scripts/screenshot.ts --all
 *
 * Examples:
 *   npx tsx scripts/screenshot.ts components-panel--default
 *   npx tsx scripts/screenshot.ts --all
 *
 * Story paths follow the pattern: category-component--story-name (lowercase, hyphens)
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

async function getAllStoryIds(): Promise<string[]> {
  const response = await fetch("http://localhost:6006/index.json");
  const index = (await response.json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  return Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
}

async function screenshot(storyPath: string): Promise<void> {
  await mkdir(screenshotsDir, { recursive: true });

  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chromium",
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });

  const url = `http://localhost:6006/iframe.html?id=${storyPath}&viewMode=story`;
  console.log(`Capturing: ${url}`);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const outputPath = join(screenshotsDir, `${storyPath}.png`);
    await page.screenshot({ path: outputPath, fullPage: true });

    console.log(`Saved: ${outputPath}`);
  } catch (error) {
    console.error(`Failed to capture ${storyPath}:`, error);
  }

  await browser.close();
}

async function screenshotAll(): Promise<void> {
  await mkdir(screenshotsDir, { recursive: true });

  const storyIds = await getAllStoryIds();
  console.log(`Found ${storyIds.length} stories to capture\n`);

  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chromium",
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });

  for (const storyId of storyIds) {
    const url = `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`;
    console.log(`Capturing: ${storyId}`);

    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const outputPath = join(screenshotsDir, `${storyId}.png`);
      await page.screenshot({ path: outputPath, fullPage: true });
    } catch (error) {
      console.error(`  Failed: ${error}`);
    }
  }

  await browser.close();
  console.log(`\nDone! ${storyIds.length} screenshots in ${screenshotsDir}`);
}

const arg = process.argv[2];

if (!arg) {
  console.log("Usage:");
  console.log("  npx tsx scripts/screenshot.ts <story-path>");
  console.log("  npx tsx scripts/screenshot.ts --all");
  process.exit(1);
}

if (arg === "--all") {
  void screenshotAll();
} else {
  void screenshot(arg);
}
