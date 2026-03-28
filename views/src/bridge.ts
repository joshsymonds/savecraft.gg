// MCP Apps bridge — connects to the host via @modelcontextprotocol/ext-apps,
// detects host theme, applies dual-theme styling, receives tool results,
// and passes structuredContent to a render callback.

import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Current theme — readable by components that need the value in JS (e.g. chart color lookups). */
let currentTheme: "light" | "dark" = "dark";

/** Returns the current theme string. */
export function getTheme(): "light" | "dark" {
  return currentTheme;
}

/** Apply theme and host style variables from a host context update. */
function applyHostContext(ctx: Partial<McpUiHostContext>): void {
  if (ctx.theme) {
    currentTheme = ctx.theme;
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
}

/**
 * Initialize the MCP Apps bridge and connect to the host.
 *
 * Sets up theme detection from host context before connecting.
 * The callback receives the full CallToolResult when the tool finishes.
 * Mount your Svelte component using result.structuredContent as props.
 */
export function initBridge(
  onResult: (result: CallToolResult) => void,
): void {
  const app = new App({ name: "savecraft-view", version: "1.0.0" });

  // Register callbacks before connecting (per docs: avoid missing initial data push)
  app.ontoolresult = onResult;
  app.onerror = (error) => console.error("[savecraft-view]", error);

  // Handle live theme/style changes from host
  app.onhostcontextchanged = (ctx) => applyHostContext(ctx);

  app.connect().then(() => {
    // Apply initial host context (theme, style variables)
    const ctx = app.getHostContext();
    if (ctx) {
      applyHostContext(ctx);
    }
  });
}
