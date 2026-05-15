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
  | { type: "text"; content: string }
  | { type: "structured"; data: Record<string, unknown> };

/** Metadata exposed to list_games alongside WASM module metadata. */
export interface ReferenceModuleMetadata {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  /**
   * A complete, copy-pasteable query_reference invocation for this module.
   * Surfaced (with `parameters`) only in the filtered list_games path so the
   * model copies the exact envelope shape instead of assembling it from the
   * schema. Top-level keys must be game_id / module / queries.
   */
  example?: unknown;
  /** Whether this module has a compiled view component (computed from VISUAL_MODULES). */
  visual?: boolean;
}

/**
 * Reference module as serialized into a list_games game entry.
 *
 * Distinct from {@link ReferenceModuleMetadata}: the internal contract keys
 * the module by `id` (a registry map key), but the wire contract names it
 * `module` so it matches the `module` argument of query_reference exactly —
 * the model copies the identifier verbatim with no remapping.
 */
export interface ListedReferenceModule {
  module: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  example?: unknown;
  visual?: boolean;
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
