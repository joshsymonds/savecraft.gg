/**
 * About / elevator-pitch copy composed from {@link ./facts}.
 *
 * The blurb counts source-kind "layers" dynamically by iterating SOURCE_KINDS
 * in canonical order, so adding or splitting a kind updates this text
 * automatically. The previous hardcoded "three layers" framing in the worker
 * silently went stale when the mod source-kind was introduced and again when
 * PoE shipped alongside WoW; encoding the count structurally prevents that
 * regression.
 */

import {
  AI_CLIENTS,
  AUTHOR,
  CONTACTS,
  PROJECT,
  SOURCE_KINDS,
  URLS,
  type SourceKindId,
} from "./facts";

/** Canonical display order for SOURCE_KINDS keys in narrative prose. */
export const SOURCE_KIND_ORDER: readonly SourceKindId[] = [
  "reference",
  "api",
  "wasm",
  "mod_selfpush",
  "mod_with_daemon",
] as const;

function describeSourceKinds(): string {
  return SOURCE_KIND_ORDER.map((id, i) => {
    const kind = SOURCE_KINDS[id];
    const games =
      kind.gamesToday.length > 0
        ? ` Example games: ${kind.gamesToday.join(", ")}.`
        : "";
    return `(${i + 1}) ${kind.label}: ${kind.shortDescription}${games}`;
  }).join(" ");
}

/** Plain-text about blob returned by the MCP `setup_help(category="about")` tool. */
export function aboutTextForMcp(): string {
  const layerCount = SOURCE_KIND_ORDER.length;
  const clientList = AI_CLIENTS.join(" and ");
  return [
    `${PROJECT.name} is an open source project that connects video game data to AI assistants (${clientList}) via the Model Context Protocol (MCP).`,
    `${layerCount} ways games connect. ${describeSourceKinds()}`,
    [
      `Open source: ${URLS.github}`,
      `Author: ${AUTHOR.name} (${AUTHOR.url})`,
      `Contact: ${CONTACTS.general}`,
      `Discord: ${URLS.discord}`,
      `License: ${PROJECT.license.name}`,
    ].join("\n"),
  ].join("\n\n");
}
