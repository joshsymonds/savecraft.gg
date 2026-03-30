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
import { parse as parseTOML } from "smol-toml";
import { resolveAttribution, type Attribution } from "../src/attributions.js";

const { readFileSync, readdirSync, writeFileSync, unlinkSync, rmSync } = fs;
const { resolve } = path;

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWS_DIR = resolve(import.meta.dirname, "..");
const WORKER_MCP_VIEWS = resolve(ROOT, "worker/src/mcp/views");
const OUTPUT_FILE = resolve(ROOT, "worker/src/mcp/views.gen.ts");

const viewCss = readFileSync(resolve(VIEWS_DIR, "src/view.css"), "utf-8");
const bridgePath = resolve(VIEWS_DIR, "src/bridge.ts").split("\\").join("/");
const attributionPath = resolve(VIEWS_DIR, "src/Attribution.svelte").split("\\").join("/");
const multiResultViewPath = resolve(VIEWS_DIR, "src/components/layout/MultiResultView.svelte").split("\\").join("/");

// ── Attribution ────────────────────────────────────────────

interface PluginAttribution {
  sources: string[];
}

function readPluginAttribution(pluginDir: string): Attribution[] {
  const tomlPath = resolve(pluginDir, "plugin.toml");
  const raw = readFileSync(tomlPath, "utf-8");
  const parsed = parseTOML(raw) as { attribution?: PluginAttribution };
  if (!parsed.attribution?.sources?.length) {
    throw new Error(
      `${tomlPath}: missing [attribution] with sources. Every plugin must declare attribution.`,
    );
  }
  return resolveAttribution(parsed.attribution.sources);
}

function deduplicateAttribution(attributions: Attribution[]): Attribution[] {
  const seen = new Set<string>();
  return attributions.filter((a) => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });
}

function readAllPluginAttributions(): Attribution[] {
  const pluginsDir = resolve(ROOT, "plugins");
  const allAttrs: Attribution[] = [];
  for (const plugin of readdirSync(pluginsDir)) {
    try {
      allAttrs.push(...readPluginAttribution(resolve(pluginsDir, plugin)));
    } catch {
      continue;
    }
  }
  return deduplicateAttribution(allAttrs);
}

// ── Discovery ──────────────────────────────────────────────

interface GameStateView {
  slug: string;
  componentPath: string;
}

interface ReferenceView {
  moduleId: string;
  componentPath: string;
  pluginDir: string;
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
              pluginDir: resolve(pluginsDir, plugin),
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
import Attribution from "${attributionPath}";

const app = initBridge((result) => {
  if (!result.structuredContent) return;
  const target = document.getElementById("root");
  if (!target) return;
  target.replaceChildren();
  mount(Component, { target, props: { data: result.structuredContent, app } });

  const attrTarget = document.getElementById("attribution");
  if (attrTarget) mount(Attribution, { target: attrTarget });
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
import Attribution from "${attributionPath}";
import MultiResultView from "${multiResultViewPath}";
${imports}

const VIEWS = {
${mapEntries}
};

const app = initBridge((result) => {
  const data = result.structuredContent;
  const moduleId = typeof data?.module === "string" ? data.module : undefined;
  const Component = moduleId ? VIEWS[moduleId] : undefined;
  const target = document.getElementById("root");
  if (!target) return;
  if (!data || !Component) {
    // No view for this module — collapse to zero height so the host iframe disappears.
    target.replaceChildren();
    document.body.style.display = "none";
    return;
  }
  target.replaceChildren();

  // Multi-query: wrap each result in a tabbed view
  if (data?._multiQuery && Array.isArray(data.results) && data.results.length > 0) {
    mount(MultiResultView, {
      target,
      props: { component: Component, results: data.results, moduleId, iconUrl: data.icon_url, app },
    });
  } else {
    // Single-query: mount directly
    mount(Component, { target, props: { data, app } });
  }

  const attrTarget = document.getElementById("attribution");
  if (attrTarget) mount(Attribution, { target: attrTarget });
});
`;
}

// ── Build ──────────────────────────────────────────────────

async function buildToHtml(name: string, entrySource: string, attribution: Attribution[]): Promise<string> {
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

    return wrapHtml(js, attribution);
  } finally {
    try { unlinkSync(tmpEntry); } catch { /* */ }
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

function wrapHtml(js: string, attribution: Attribution[]): string {
  const attrScript = attribution.length > 0
    ? `<script>window.__ATTRIBUTION__=${JSON.stringify(attribution)};<\/script>\n`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Chakra+Petch:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${viewCss}</style>
</head>
<body>
<div id="root"></div>
<div id="attribution"></div>
${attrScript}<script>${js}<\/script>
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

  // Resolve attribution for all views
  const allPluginAttribution = readAllPluginAttributions();

  // Reference views: deduplicate attribution across all plugins that contribute views
  const refPluginDirs = [...new Set(referenceViews.map((v) => v.pluginDir))];
  const refAttribution = deduplicateAttribution(
    refPluginDirs.flatMap((dir) => readPluginAttribution(dir)),
  );

  const views: Record<string, string> = {};

  // Build each game state view as its own HTML page (aggregates all plugin attributions)
  for (const view of gameStateViews) {
    console.log(`Building game state view: ${view.slug}`);
    views[view.slug] = await buildToHtml(view.slug, gameStateEntry(view), allPluginAttribution);
  }

  // Build all reference views into one bundled HTML page
  if (referenceViews.length > 0) {
    console.log(`Building reference view bundle (${String(referenceViews.length)} modules)`);
    views["reference"] = await buildToHtml("reference", referenceEntry(referenceViews), refAttribution);
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
