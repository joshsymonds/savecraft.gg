/**
 * Per-game fallback labels for saves that have no learned display name yet.
 * Magic's save_name is the identity constant "player", not presentable — the
 * real name arrives on first match connect and self-heals (see hub.ts
 * pushIdentity / store.ts storePush).
 */
const GAME_LABEL_DEFAULTS: Record<string, string> = {
  magic: "MTG Arena Player",
};

/**
 * Resolve the presentable label for a save. A non-empty display_name always
 * wins; otherwise fall back to a per-game default (for identity keys that
 * aren't presentable on their own), then to save_name itself.
 */
export function saveLabel(
  gameId: string,
  saveName: string,
  displayName: string | null | undefined,
): string {
  if (displayName) return displayName;
  return GAME_LABEL_DEFAULTS[gameId] ?? saveName;
}
