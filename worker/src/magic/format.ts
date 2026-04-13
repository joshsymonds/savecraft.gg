/**
 * Derive the Arena format name from an MTGA event ID.
 *
 * Event IDs are underscore-delimited tokens like:
 *   - "Constructed_Event_2026_Standard_Ranked"
 *   - "Ladder" / "Play" (unranked Standard)
 *   - "Historic_Ranked" / "Alchemy_Ranked" / "Explorer_Ranked" / "Timeless_Ranked"
 *   - "Traditional_Constructed_Event_2026_Standard"
 *   - "Brawl_..." / "StandardBrawl_..."
 *   - "QuickDraft_TMT_20260313" / "PremierDraft_LCI_20260313" (Limited — not Constructed)
 *
 * Returns the canonical format name or empty string for unrecognized events.
 */

// Event prefixes that indicate Limited (not Constructed) — skip these.
const LIMITED_PREFIXES = new Set([
  "QuickDraft",
  "PremierDraft",
  "TradDraft",
  "BotDraft",
  "Sealed",
  "TraditionalSealed",
]);

// Token → format mapping. Order matters: StandardBrawl before Standard and Brawl.
const TOKEN_FORMATS: [string, string][] = [
  ["StandardBrawl", "Standard Brawl"],
  ["Standard", "Standard"],
  ["Alchemy", "Alchemy"],
  ["Historic", "Historic"],
  ["Explorer", "Explorer"],
  ["Timeless", "Timeless"],
  ["Brawl", "Brawl"],
];

// Exact event IDs that map to Standard.
const STANDARD_ALIASES = new Set(["Ladder", "Play"]);

export function deriveFormat(eventId: string): string {
  if (STANDARD_ALIASES.has(eventId)) return "Standard";

  const tokens = eventId.split("_");

  // Skip Limited events
  if (tokens[0] && LIMITED_PREFIXES.has(tokens[0])) return "";

  // Check tokens for format keywords
  for (const [keyword, format] of TOKEN_FORMATS) {
    if (tokens.includes(keyword)) return format;
  }

  return "";
}
