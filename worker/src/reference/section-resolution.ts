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

  // Check for conflicts: extracted keys must not already be in the query
  for (const key of Object.keys(extracted)) {
    if (query[key] !== undefined && query[key] !== null) {
      throw new Error(
        `Parameter "${key}" conflicts with section reference "${mapping.sectionParam}". ` +
          `Provide either inline data or a section reference, not both.`,
      );
    }
  }

  return extracted;
}

/**
 * Resolve section references in a query, returning the enriched query.
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

  for (const mapping of active) {
    const extracted = await resolveOneSection(db, saveId, mapping, query);
    Object.assign(enriched, extracted);
  }

  return enriched;
}
