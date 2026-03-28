// Build MCP App view components into self-contained HTML strings and JS fragments.
//
// Discovers view components from:
//   worker/src/mcp/views/<name>.svelte        -> game state views (full HTML widgets)
//   plugins/<game>/reference/views/<name>.svelte -> reference views (JS fragments)
//
// Outputs worker/src/mcp/widgets.gen.ts with:
//   VIEW_HTML     — self-contained HTML per game state tool
//   VIEW_SHELL    — reference view shell HTML
//   VIEW_SCRIPTS  — JS fragments per reference module

import * as fs from "fs";
import * as path from "path";

const { readFileSync, readdirSync, writeFileSync, unlinkSync, rmSync } = fs;
const { resolve } = path;
import { build, type InlineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWS_DIR = resolve(import.meta.dirname, "..");
const WORKER_MCP_VIEWS = resolve(ROOT, "worker/src/mcp/views");
const OUTPUT_FILE = resolve(ROOT, "worker/src/mcp/views.gen.ts");

// Design tokens CSS
const viewCss = readFileSync(resolve(VIEWS_DIR, "src/view.css"), "utf-8");

// Shell template
const shellTemplate = readFileSync(resolve(VIEWS_DIR, "src/shell.html"), "utf-8");

interface ViewEntry {
  /** Identifier used as key in the output map */
  id: string;
  /** Absolute path to the .svelte component */
  componentPath: string;
  /** "widget" = self-contained HTML, "fragment" = JS-only for _meta.viewScript */
  mode: "widget" | "fragment";
}

function discoverViews(): ViewEntry[] {
  const entries: ViewEntry[] = [];

  // Game state views → self-contained HTML widgets
  try {
    for (const file of readdirSync(WORKER_MCP_VIEWS)) {
      if (file.endsWith(".svelte") && !file.endsWith(".stories.svelte")) {
        entries.push({
          id: file.replace(".svelte", ""),
          componentPath: resolve(WORKER_MCP_VIEWS, file),
          mode: "widget",
        });
      }
    }
  } catch {
    // No game state views yet
  }

  // Reference views → JS fragments
  const pluginsDir = resolve(ROOT, "plugins");
  try {
    for (const plugin of readdirSync(pluginsDir)) {
      const viewsDir = resolve(pluginsDir, plugin, "reference/views");
      try {
        for (const file of readdirSync(viewsDir)) {
          if (file.endsWith(".svelte") && !file.endsWith(".stories.svelte")) {
            // Convert filename to module ID: card-search → card_search
            const id = file.replace(".svelte", "").split("-").join("_");
            entries.push({
              id,
              componentPath: resolve(viewsDir, file),
              mode: "fragment",
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

  return entries;
}

/**
 * Create a temporary entry file that imports the Svelte component and mounts it.
 */
function createEntrySource(entry: ViewEntry): string {
  if (entry.mode === "widget") {
    // Self-contained widget: import bridge + component, listen for postMessage
    return `
import { mount } from "svelte";
import { initBridge } from "${resolve(VIEWS_DIR, "src/bridge.ts").split("\\").join("/")}";
import Component from "${entry.componentPath.split("\\").join("/")}";

initBridge(({ structuredContent }) => {
  const target = document.getElementById("root");
  if (target) {
    target.replaceChildren();
    mount(Component, { target, props: { data: structuredContent } });
  }
});
`;
  }

  // Reference view fragment: read __VIEW_DATA__ and mount
  return `
import { mount } from "svelte";
import Component from "${entry.componentPath.split("\\").join("/")}";

const data = window.__VIEW_DATA__;
const target = document.getElementById("root");
if (target) {
  target.replaceChildren();
  mount(Component, { target, props: { data } });
}
`;
}

async function buildEntry(entry: ViewEntry): Promise<string> {
  const entrySource = createEntrySource(entry);

  // Write temporary entry file
  const tmpEntry = resolve(VIEWS_DIR, `.tmp-entry-${entry.id}.ts`);
  writeFileSync(tmpEntry, entrySource);

  try {
    const config: InlineConfig = {
      configFile: false,
      root: VIEWS_DIR,
      plugins: [
        svelte({
          emitCss: false,
        }),
      ],
      build: {
        lib: {
          entry: tmpEntry,
          formats: ["iife"],
          name: `View_${entry.id.split("-").join("_")}`,
        },
        outDir: resolve(VIEWS_DIR, `.tmp-out-${entry.id}`),
        emptyOutDir: true,
        minify: true,
        write: true,
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
      logLevel: "warn",
    };

    await build(config);

    // Read the output
    const outDir = resolve(VIEWS_DIR, `.tmp-out-${entry.id}`);
    const files = readdirSync(outDir);
    const jsFile = files.find((f) => f.endsWith(".iife.js") || f.endsWith(".js"));
    if (!jsFile) throw new Error(`No JS output found for ${entry.id}`);

    return readFileSync(resolve(outDir, jsFile), "utf-8");
  } finally {
    // Cleanup tmp files
    try {
      unlinkSync(tmpEntry);
      rmSync(resolve(VIEWS_DIR, `.tmp-out-${entry.id}`), {
        recursive: true,
        force: true,
      });
    } catch {
      // Cleanup is best-effort
    }
  }
}

function wrapInHtml(js: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Chakra+Petch:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>${viewCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}<\/script>
  </body>
</html>`;
}

async function buildBridgeIIFE(): Promise<string> {
  // Build bridge.ts as a standalone IIFE that auto-initializes in shell mode
  const shellEntry = `
import { initBridge } from "${resolve(VIEWS_DIR, "src/bridge.ts").split("\\").join("/")}";
initBridge();
`;
  const tmpEntry = resolve(VIEWS_DIR, ".tmp-entry-shell-bridge.ts");
  writeFileSync(tmpEntry, shellEntry);

  try {
    await build({
      configFile: false,
      root: VIEWS_DIR,
      plugins: [],
      build: {
        lib: {
          entry: tmpEntry,
          formats: ["iife"],
          name: "ShellBridge",
        },
        outDir: resolve(VIEWS_DIR, ".tmp-out-shell-bridge"),
        emptyOutDir: true,
        minify: true,
        write: true,
      },
      logLevel: "warn",
    });

    const outDir = resolve(VIEWS_DIR, ".tmp-out-shell-bridge");
    const files = readdirSync(outDir);
    const jsFile = files.find((f) => f.endsWith(".js"));
    if (!jsFile) throw new Error("No JS output for shell bridge");
    return readFileSync(resolve(outDir, jsFile), "utf-8");
  } finally {
    try {
      unlinkSync(tmpEntry);
      rmSync(resolve(VIEWS_DIR, ".tmp-out-shell-bridge"), {
        recursive: true,
        force: true,
      });
    } catch {
      // best-effort
    }
  }
}

async function main() {
  console.log("Discovering views...");
  const entries = discoverViews();
  console.log(
    `Found ${entries.length} views: ${entries.map((e) => `${e.id} (${e.mode})`).join(", ")}`,
  );

  if (entries.length === 0) {
    console.log("No views found. Writing empty output.");
  }

  // Build all entries
  const viewHtml: Record<string, string> = {};
  const viewScripts: Record<string, string> = {};

  for (const entry of entries) {
    console.log(`Building ${entry.id} (${entry.mode})...`);
    const js = await buildEntry(entry);

    if (entry.mode === "widget") {
      viewHtml[entry.id] = wrapInHtml(js);
    } else {
      viewScripts[entry.id] = js;
    }
  }

  // Build the reference shell
  console.log("Building reference shell...");
  const bridgeJs = await buildBridgeIIFE();
  const shell = shellTemplate
    .replace("%%VIEW_CSS%%", viewCss)
    .replace("%%BRIDGE_JS%%", bridgeJs);

  // Write output
  const output = `// Auto-generated by views/scripts/build.ts. Do not edit.

export const VIEW_HTML: Record<string, string> = ${JSON.stringify(viewHtml, null, 2)};

export const VIEW_SHELL = ${JSON.stringify(shell)};

export const VIEW_SCRIPTS: Record<string, string> = ${JSON.stringify(viewScripts, null, 2)};
`;

  writeFileSync(OUTPUT_FILE, output);
  console.log(`\nWritten to ${OUTPUT_FILE}`);
  console.log(`  ${Object.keys(viewHtml).length} view HTML entries`);
  console.log(`  ${Object.keys(viewScripts).length} view script entries`);
  console.log(`  Shell: ${(shell.length / 1024).toFixed(1)}KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
