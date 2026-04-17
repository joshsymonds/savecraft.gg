// game_id aliases for historical renames. Aliases are one-way: the legacy
// id rewrites to the canonical id, never the reverse. Daemons with cached
// plugin WASM can keep pushing the old id indefinitely; this module is the
// single choke point that converts them to canonical form before dedup,
// routing, and storage read the value.
//
// mtga→magic: plugin renamed 2026-04-12 (commits 322d3fd, f15fedc, e19744d).
const ALIASES: Record<string, string> = {
  mtga: "magic",
};

export function normalizeGameId(gameId: string): string {
  return ALIASES[gameId] ?? gameId;
}
