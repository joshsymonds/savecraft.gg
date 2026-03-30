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
  | { type: "formatted"; content: string }
  | { type: "structured"; data: Record<string, unknown> };

/** Metadata exposed to list_games alongside WASM module metadata. */
export interface ReferenceModuleMetadata {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * Declares how a module accepts data from a save section.
 *
 * When a query contains `sectionParam` (e.g., "deck_section"), the dispatcher
 * fetches the section from D1, calls `extract` on the parsed JSON, and merges
 * the returned params into the query. The module never sees the section reference.
 */
export interface SectionMapping {
  /** Query param that triggers section resolution (e.g., "deck_section"). */
  sectionParam: string;
  /** Extract module params from the parsed section JSON data. */
  extract: (sectionData: unknown) => Record<string, unknown>;
}

/** Contract for a native reference module. */
export interface NativeReferenceModule extends ReferenceModuleMetadata {
  /** Optional section-reference mappings for resolving save data. */
  sectionMappings?: SectionMapping[];
  execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult>;
}
