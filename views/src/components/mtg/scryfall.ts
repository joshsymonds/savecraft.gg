// Scryfall card image URL construction.
//
// Full card images only (never art_crop) — the printed artist/copyright
// line is the attribution. Hotlinked directly from cards.scryfall.io.

const SCRYFALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Build a Scryfall card image URL from a Scryfall card ID.
 * Returns null for empty or malformed ids (anything not a lowercase UUID).
 */
export function cardImageUrl(
  scryfallId: string,
  size: "small" | "normal" | "large" = "normal",
): string | null {
  if (!SCRYFALL_ID_RE.test(scryfallId)) return null;
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;
}
