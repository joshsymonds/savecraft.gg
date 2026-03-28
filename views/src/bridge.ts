/**
 * MCP Apps postMessage bridge.
 *
 * Listens for ui/notifications/tool-result messages from the MCP host,
 * extracts structuredContent and _meta, then either:
 * - Loads _meta.viewScript as a blob URL script (reference views)
 * - Calls the provided render callback (self-contained game state views)
 */

export interface WidgetData {
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

type RenderCallback = (data: WidgetData) => void;

/**
 * Initialize the bridge. Call once from the widget entry point.
 *
 * For self-contained widgets (game state views), pass a render callback.
 * The callback receives the structured data and can mount the appropriate component.
 *
 * For the reference shell, call with no arguments — the bridge will look for
 * _meta.viewScript and load it via blob URL. The loaded script reads
 * window.__VIEW_DATA__ to get the structured content.
 */
export function initBridge(onRender?: RenderCallback): void {
  window.addEventListener(
    "message",
    (event: MessageEvent) => {
      if (event.source !== window.parent) return;

      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method !== "ui/notifications/tool-result") return;

      const { structuredContent, _meta } = message.params ?? {};
      if (!structuredContent) return;

      const data: WidgetData = { structuredContent, _meta };

      // Reference shell mode: load viewScript via blob URL
      const viewScript = _meta?.viewScript;
      if (typeof viewScript === "string" && viewScript.length > 0) {
        loadViewScript(structuredContent, viewScript);
        return;
      }

      // Self-contained widget mode: call render callback
      if (onRender) {
        onRender(data);
      }
    },
    { passive: true },
  );
}

/**
 * Load a view's compiled JS as an inline script.
 * Sets window.__VIEW_DATA__ so the view script can read it synchronously.
 *
 * Uses inline script injection (allowed by MCP Apps default CSP: script-src 'unsafe-inline')
 * rather than blob URLs (which are NOT in the default CSP script-src).
 */
function loadViewScript(
  structuredContent: Record<string, unknown>,
  scriptSource: string,
): void {
  // Make data available to the view script before it executes
  (window as unknown as Record<string, unknown>).__VIEW_DATA__ =
    structuredContent;

  const script = document.createElement("script");
  script.textContent = scriptSource;
  document.head.appendChild(script);
}
