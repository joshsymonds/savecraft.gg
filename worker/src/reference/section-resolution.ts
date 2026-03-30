/**
 * Section-reference resolution for native reference modules.
 *
 * When a query contains a section param (e.g., "deck_section"), this module
 * fetches the section from D1, verifies user ownership, extracts the relevant
 * fields via the module's declared mapping, and merges them into the query.
 * The module itself never sees the section reference — only the extracted data.
 */

import type { NativeReferenceModule, SectionMapping } from "./types";

/**
 * Optional cache of save_ids already verified for the current user.
 * Avoids redundant ownership checks when a batch of queries references
 * the same save_id.
 */
export type VerifiedSaveCache = Set<string>;

/** Verify the user owns the save, using cache to skip redundant checks. */
async function verifySaveOwnership(
  db: D1Database,
  saveId: string,
  userUuid: string,
  cache?: VerifiedSaveCache,
): Promise<void> {
  if (cache?.has(saveId)) return;

  const save = await db
    .prepare("SELECT uuid FROM saves WHERE uuid = ? AND user_uuid = ? AND removed_at IS NULL")
    .bind(saveId, userUuid)
    .first<{ uuid: string }>();

  if (!save) {
    throw new Error("Save not found. Check that the save_id is correct and belongs to you.");
  }
  cache?.add(saveId);
}

/** Fetch a section from D1 and extract params via the mapping. */
async function resolveOneSection(
  db: D1Database,
  saveId: string,
  mapping: SectionMapping,
  query: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sectionName = query[mapping.sectionParam] as string;

  const row = await db
    .prepare("SELECT data FROM sections WHERE save_uuid = ? AND name = ?")
    .bind(saveId, sectionName)
    .first<{ data: string }>();

  if (!row) {
    throw new Error(
      `Section not found: "${sectionName}" in save ${saveId}. Call get_save to see available sections.`,
    );
  }

  const sectionData = JSON.parse(row.data) as unknown;
  const extracted = mapping.extract(sectionData);

  // Explicit query params take precedence over section-extracted values.
  // This lets callers pass mode/format alongside a section reference —
  // the section provides primary data (deck, pool), query provides intent.
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (query[key] === undefined || query[key] === null) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Resolve section references for WASM modules using manifest-declared mappings.
 *
 * Unlike native modules (which declare an `extract` function), WASM section
 * mappings are simple `{queryKey: sectionName}` pairs read from the plugin
 * manifest. When `save_id` is present in the query, each mapped section is
 * fetched from D1 and injected whole under its query key.
 *
 * If `save_id` is absent, returns the query unchanged (the module may work
 * without save data). Explicit query params take precedence over section data.
 */
export async function resolveWasmSectionParams(
  db: D1Database,
  userUuid: string,
  sectionMappings: Record<string, string>,
  query: Record<string, unknown>,
  verifiedSaves?: VerifiedSaveCache,
): Promise<Record<string, unknown>> {
  const saveId = query.save_id as string | undefined;
  if (!saveId) return query;

  await verifySaveOwnership(db, saveId, userUuid, verifiedSaves);

  // Build enriched query: strip save_id, inject section data under mapped keys
  const enriched: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== "save_id") enriched[key] = value;
  }

  // Fetch all sections in parallel
  const entries = Object.entries(sectionMappings);
  const results = await Promise.all(
    entries.map(async ([, sectionName]) => {
      const row = await db
        .prepare("SELECT data FROM sections WHERE save_uuid = ? AND name = ?")
        .bind(saveId, sectionName)
        .first<{ data: string }>();

      if (!row) {
        throw new Error(
          `Section not found: "${sectionName}" in save ${saveId}. Call get_save to see available sections.`,
        );
      }

      return JSON.parse(row.data) as unknown;
    }),
  );

  for (let i = 0; i < entries.length; i++) {
    const queryKey = entries[i]![0];
    // Explicit query params take precedence over section data
    if (enriched[queryKey] === undefined || enriched[queryKey] === null) {
      enriched[queryKey] = results[i];
    }
  }

  return enriched;
}

/**
 * Resolve section references in a query for native modules, returning the enriched query.
 *
 * If no section params are present, returns the query unchanged.
 * Throws on: missing save_id, authorization failure, section not found,
 * or conflicting inline data.
 */
export async function resolveSectionParams(
  db: D1Database,
  userUuid: string,
  module: NativeReferenceModule,
  query: Record<string, unknown>,
  verifiedSaves?: VerifiedSaveCache,
): Promise<Record<string, unknown>> {
  const mappings = module.sectionMappings;
  if (!mappings || mappings.length === 0) return query;

  // Find which section params are present in the query
  const active = mappings.filter(
    (m) => query[m.sectionParam] !== undefined && query[m.sectionParam] !== null,
  );
  if (active.length === 0) return query;

  // Require save_id when any section param is present
  const saveId = query.save_id as string | undefined;
  if (!saveId) {
    throw new Error(
      `save_id is required when using section references (${active.map((m) => m.sectionParam).join(", ")}).`,
    );
  }

  await verifySaveOwnership(db, saveId, userUuid, verifiedSaves);

  // Build enriched query: original minus dispatch keys, plus extracted section data
  const stripKeys = new Set<string>(["save_id", ...active.map((m) => m.sectionParam)]);
  const enriched: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!stripKeys.has(key)) enriched[key] = value;
  }

  const results = await Promise.all(
    active.map((mapping) => resolveOneSection(db, saveId, mapping, query)),
  );
  for (const extracted of results) {
    Object.assign(enriched, extracted);
  }

  return enriched;
}
