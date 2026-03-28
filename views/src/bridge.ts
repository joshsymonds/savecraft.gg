// MCP Apps bridge — connects to the host via @modelcontextprotocol/ext-apps,
// receives tool results, and passes structuredContent to a render callback.

import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Initialize the MCP Apps bridge and connect to the host.
 *
 * The callback receives the full CallToolResult when the tool finishes.
 * Mount your Svelte component using result.structuredContent as props.
 */
export function initBridge(
  onResult: (result: CallToolResult) => void,
): void {
  const app = new App({ name: "savecraft-view", version: "1.0.0" });

  app.ontoolresult = onResult;
  app.onerror = (error) => console.error("[savecraft-view]", error);

  app.connect();
}
