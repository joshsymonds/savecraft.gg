/**
 * Native reference module contract.
 *
 * Native modules run in-process in the MCP Worker with full platform bindings
 * (D1, Vectorize, Workers AI, etc.), unlike WASM reference modules which are
 * sandboxed and dispatched via Workers for Platforms.
 *
 * Both types are transparent to MCP consumers — the query_reference tool
 * routes to whichever implementation is registered.
 */

import type { Env } from "../types";

/** Result from a native reference module execution. */
export type ReferenceResult =
  | { type: "formatted"; content: string; presentation?: string }
  | { type: "structured"; data: Record<string, unknown>; presentation?: string };

/** Metadata exposed to list_games alongside WASM module metadata. */
export interface ReferenceModuleMetadata {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** Contract for a native reference module. */
export interface NativeReferenceModule extends ReferenceModuleMetadata {
  execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult>;
}
