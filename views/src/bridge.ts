// MCP Apps bridge — wraps @modelcontextprotocol/ext-apps App class.
//
// Handles the ui/initialize handshake, receives tool results, and either:
// - Calls a render callback (self-contained game state views)
// - Loads _meta.viewScript as an inline script (reference shell)

import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ViewData {
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

type RenderCallback = (data: ViewData) => void;

/**
 * Initialize the MCP Apps bridge. Call once from the view entry point.
 *
 * For self-contained views (game state), pass a render callback.
 * For the reference shell, call with no arguments — the bridge loads
 * _meta.viewScript via inline script injection.
 */
export function initBridge(onRender?: RenderCallback): void {
  const app = new App({ name: "savecraft-view", version: "1.0.0" });

  app.ontoolresult = (result: CallToolResult) => {
    const structuredContent = (result.structuredContent ?? {}) as Record<string, unknown>;
    const _meta = (result._meta ?? undefined) as Record<string, unknown> | undefined;

    // Reference shell mode: load viewScript via inline script injection
    const viewScript = _meta?.viewScript;
    if (typeof viewScript === "string" && viewScript.length > 0) {
      loadViewScript(structuredContent, viewScript);
      return;
    }

    // Self-contained view mode: call render callback
    if (onRender) {
      onRender({ structuredContent, _meta });
    }
  };

  app.onerror = (error) => {
    console.error("[savecraft-view]", error);
  };

  app.connect();
}

/**
 * Load a view's compiled JS as an inline script.
 * Sets window.__VIEW_DATA__ so the view script can read it synchronously.
 *
 * Uses inline script injection (allowed by MCP Apps CSP: script-src 'unsafe-inline')
 * rather than blob URLs (which are NOT in the default CSP script-src).
 */
function loadViewScript(
  structuredContent: Record<string, unknown>,
  scriptSource: string,
): void {
  (window as unknown as Record<string, unknown>).__VIEW_DATA__ = structuredContent;

  const script = document.createElement("script");
  script.textContent = scriptSource;
  document.head.appendChild(script);
}
