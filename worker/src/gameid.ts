// game_id aliases for historical renames. Aliases are one-way: the legacy
// id rewrites to the canonical id, never the reverse. Daemons with cached
// plugin WASM can keep pushing the old id indefinitely; this converts them
// to canonical form before dedup, routing, and storage read the value.
//
// mtga→magic: plugin renamed 2026-04-12 (commits 322d3fd, f15fedc, e19744d).
// Paired with migration 0047 which rewrites pre-alias rows in saves + source_configs.
// mtg→magic: typo alias for LLMs that drop the trailing "a" — observed in
// production MCP traffic from both Claude and ChatGPT.
//
// Null-prototype table: a daemon sending a reserved key like `__proto__`
// or `constructor` would otherwise resolve to Object.prototype's member and
// bypass the `??` fallback — with no prototype chain, every miss is undefined.
const ALIASES: Record<string, string> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    mtga: "magic",
    mtg: "magic",
  }),
);

export function normalizeGameId(gameId: string): string {
  return ALIASES[gameId] ?? gameId;
}
