// Build MCP App views into self-contained HTML pages.
//
// Discovers Svelte view components from:
//   worker/src/mcp/views/<name>.svelte                  -> one HTML page per tool
//   plugins/<game>/reference/views/<name>.svelte         -> one bundled HTML page for query_reference
//
// Outputs worker/src/mcp/views.gen.ts:
//   VIEWS: Record<string, string>  — slug -> self-contained HTML

import * as fs from "fs";
import * as path from "path";
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const { readFileSync, readdirSync, writeFileSync, unlinkSync, rmSync } = fs;
const { resolve } = path;

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWS_DIR = resolve(import.meta.dirname, "..");
const WORKER_MCP_VIEWS = resolve(ROOT, "worker/src/mcp/views");
const OUTPUT_FILE = resolve(ROOT, "worker/src/mcp/views.gen.ts");

const viewCss = readFileSync(resolve(VIEWS_DIR, "src/view.css"), "utf-8");
const bridgePath = resolve(VIEWS_DIR, "src/bridge.ts").split("\\").join("/");

// ── Discovery ──────────────────────────────────────────────

interface GameStateView {
  slug: string;
  componentPath: string;
}

interface ReferenceView {
  moduleId: string;
  componentPath: string;
}

function discoverGameStateViews(): GameStateView[] {
  const views: GameStateView[] = [];
  try {
    for (const file of readdirSync(WORKER_MCP_VIEWS)) {
      if (file.endsWith(".svelte") && !file.endsWith(".stories.svelte")) {
        views.push({
          slug: file.replace(".svelte", ""),
          componentPath: resolve(WORKER_MCP_VIEWS, file),
        });
      }
    }
  } catch {
    // No game state views directory
  }
  return views;
}

function discoverReferenceViews(): ReferenceView[] {
  const views: ReferenceView[] = [];
  const pluginsDir = resolve(ROOT, "plugins");
  try {
    for (const plugin of readdirSync(pluginsDir)) {
      const viewsDir = resolve(pluginsDir, plugin, "reference/views");
      try {
        for (const file of readdirSync(viewsDir)) {
          if (file.endsWith(".svelte") && !file.endsWith(".stories.svelte")) {
            views.push({
              moduleId: file.replace(".svelte", "").split("-").join("_"),
              componentPath: resolve(viewsDir, file),
            });
          }
        }
      } catch {
        // No reference views in this plugin
      }
    }
  } catch {
    // No plugins directory
  }
  return views;
}

// ── Entry Generation ───────────────────────────────────────

function gameStateEntry(view: GameStateView): string {
  const componentPath = view.componentPath.split("\\").join("/");
  return `
import { mount } from "svelte";
import { initBridge } from "${bridgePath}";
import Component from "${componentPath}";

initBridge((result) => {
  const target = document.getElementById("root");
  if (!target) return;
  target.replaceChildren();
  mount(Component, { target, props: { data: result.structuredContent } });
});
`;
}

function referenceEntry(views: ReferenceView[]): string {
  const imports = views
    .map((v, i) => `import View${String(i)} from "${v.componentPath.split("\\").join("/")}";`)
    .join("\n");

  const mapEntries = views
    .map((v, i) => `  "${v.moduleId}": View${String(i)},`)
    .join("\n");

  return `
import { mount } from "svelte";
import { initBridge } from "${bridgePath}";
${imports}

const VIEWS = {
${mapEntries}
};

initBridge((result) => {
  const data = result.structuredContent;
  const moduleId = data?.module;
  const Component = typeof moduleId === "string" ? VIEWS[moduleId] : undefined;
  const target = document.getElementById("root");
  if (!target) return;
  target.replaceChildren();
  if (Component) {
    mount(Component, { target, props: { data } });
  } else {
    target.textContent = moduleId
      ? "No view for module: " + moduleId
      : "Missing module identifier in response";
  }
});
`;
}

// ── Build ──────────────────────────────────────────────────

async function buildToHtml(name: string, entrySource: string): Promise<string> {
  const tmpEntry = resolve(VIEWS_DIR, `.tmp-entry-${name}.ts`);
  writeFileSync(tmpEntry, entrySource);

  const outDir = resolve(VIEWS_DIR, `.tmp-out-${name}`);

  try {
    await build({
      configFile: false,
      root: VIEWS_DIR,
      plugins: [svelte({ emitCss: false })],
      build: {
        lib: {
          entry: tmpEntry,
          formats: ["iife"],
          name: `View_${name.split("-").join("_")}`,
        },
        outDir,
        emptyOutDir: true,
        minify: true,
        write: true,
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
      },
      logLevel: "warn",
    });

    const files = readdirSync(outDir);
    const jsFile = files.find((f: string) => f.endsWith(".js"));
    if (!jsFile) throw new Error(`No JS output for ${name}`);
    const js = readFileSync(resolve(outDir, jsFile), "utf-8");

    return wrapHtml(js);
  } finally {
    try { unlinkSync(tmpEntry); } catch { /* */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

function wrapHtml(js: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${viewCss}</style>
</head>
<body>
<div id="root"></div>
<script>${js}<\/script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const gameStateViews = discoverGameStateViews();
  const referenceViews = discoverReferenceViews();

  console.log(
    `Found ${String(gameStateViews.length)} game state view(s): ${gameStateViews.map((v) => v.slug).join(", ") || "(none)"}`,
  );
  console.log(
    `Found ${String(referenceViews.length)} reference view(s): ${referenceViews.map((v) => v.moduleId).join(", ") || "(none)"}`,
  );

  const views: Record<string, string> = {};

  // Build each game state view as its own HTML page
  for (const view of gameStateViews) {
    console.log(`Building game state view: ${view.slug}`);
    views[view.slug] = await buildToHtml(view.slug, gameStateEntry(view));
  }

  // Build all reference views into one bundled HTML page
  if (referenceViews.length > 0) {
    console.log(`Building reference view bundle (${String(referenceViews.length)} modules)`);
    views["reference"] = await buildToHtml("reference", referenceEntry(referenceViews));
  }

  // Write output
  const output = `// Auto-generated by views/scripts/build.ts. Do not edit.
// prettier-ignore
export const VIEWS: Record<string, string> = ${JSON.stringify(views, null, 2)};
`;

  writeFileSync(OUTPUT_FILE, output);

  console.log(`\nWritten to ${OUTPUT_FILE}`);
  for (const [slug, html] of Object.entries(views)) {
    console.log(`  ${slug}: ${(html.length / 1024).toFixed(1)}KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
