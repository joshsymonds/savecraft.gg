/**
 * Section-reference resolution for native reference modules.
 *
 * When a query contains a section param (e.g., "deck_section"), this module
 * fetches the section from D1, verifies user ownership, extracts the relevant
 * fields via the module's declared mapping, and merges them into the query.
 * The module itself never sees the section reference — only the extracted data.
 */

import type { NativeReferenceModule } from "./types";

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
): Promise<Record<string, unknown>> {
  const mappings = module.sectionMappings;
  if (!mappings || mappings.length === 0) return query;

  // Find which section params are present in the query
  const active = mappings.filter((m) => query[m.sectionParam] != null);
  if (active.length === 0) return query;

  // Require save_id when any section param is present
  const saveId = query.save_id as string | undefined;
  if (!saveId) {
    throw new Error(
      `save_id is required when using section references (${active.map((m) => m.sectionParam).join(", ")}).`,
    );
  }

  // Verify user owns this save
  const save = await db
    .prepare("SELECT uuid FROM saves WHERE uuid = ? AND user_uuid = ? AND removed_at IS NULL")
    .bind(saveId, userUuid)
    .first<{ uuid: string }>();

  if (!save) {
    throw new Error("Save not found. Check that the save_id is correct and belongs to you.");
  }

  // Resolve each active section param
  const enriched = { ...query };
  delete enriched.save_id;

  for (const mapping of active) {
    const sectionName = query[mapping.sectionParam] as string;

    // Fetch section from D1
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
      if (query[key] != null) {
        throw new Error(
          `Parameter "${key}" conflicts with section reference "${mapping.sectionParam}". ` +
            `Provide either inline data or a section reference, not both.`,
        );
      }
    }

    // Merge extracted params and remove the section param
    Object.assign(enriched, extracted);
    delete enriched[mapping.sectionParam];
  }

  return enriched;
}
