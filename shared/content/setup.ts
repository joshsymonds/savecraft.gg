/**
 * Setup / install copy composed from {@link ./facts}.
 *
 * The worker's `setup_help(category="setup")` response is a structured JSON
 * object (linux, windows, macos each as `{install, details}`, plus a pairing
 * string, plus optional `api_games`). This module preserves that shape while
 * sourcing every string from facts — so a fix to (say) the Linux install
 * command propagates without touching the worker handler.
 *
 * The DB stores `source_kind` as `"daemon" | "adapter" | "mod"`; our richer
 * SOURCE_KINDS schema uses `"wasm" | "api" | "mod_selfpush" | "mod_with_daemon"`.
 * `sourceSetupBlurbForMcp` maps between them.
 */

import { PAIRING, PLATFORM_INSTALL, SOURCE_KINDS, URLS } from "./facts";

/** Shape returned for each platform in the MCP setup response. */
export interface PlatformGuide {
  /** Shell command (Linux) or human-readable browser instruction (Windows) or null (macOS). */
  install: string | null;
  /** Multi-sentence supporting description. */
  details: string;
}

export type PlatformId = "linux" | "windows" | "macos";

function detailsFor(platform: PlatformId): string {
  const p = PLATFORM_INSTALL[platform];
  if (!p.available) {
    return p.instructions ?? "Not yet available.";
  }
  const parts = [p.installsTo, p.runtime, p.signing, p.postInstall].filter(
    (x): x is string => Boolean(x),
  );
  return parts.join(" ");
}

function installFor(platform: PlatformId): string | null {
  const p = PLATFORM_INSTALL[platform];
  // Unavailable platforms expose install=null so callers can distinguish
  // "there is a way to install" from "the answer is in `details`".
  if (!p.available) return null;
  return p.command ?? p.instructions ?? null;
}

export function platformGuideForMcp(platform: PlatformId): PlatformGuide {
  return { install: installFor(platform), details: detailsFor(platform) };
}

/** Memoized full-platforms guide. Inputs are all module-scope constants. */
const ALL_PLATFORM_GUIDES: Record<PlatformId, PlatformGuide> = {
  linux: platformGuideForMcp("linux"),
  windows: platformGuideForMcp("windows"),
  macos: platformGuideForMcp("macos"),
};

export function allPlatformGuidesForMcp(): Record<PlatformId, PlatformGuide> {
  return ALL_PLATFORM_GUIDES;
}

/** Returns true if the given string is a supported platform key. */
export function isPlatformId(s: string | undefined): s is PlatformId {
  return s === "linux" || s === "windows" || s === "macos";
}

/** Pairing instructions appended to every daemon-flavored setup response. */
export const PAIRING_TEXT_FOR_MCP =
  `After installing, the daemon self-registers and displays a pairing link (${PAIRING.linkUrlPattern}). ` +
  `Click the link, use the tray app's '${PAIRING.trayButtonLabel}' button, or enter the ${PAIRING.codeFormat} code on the ${URLS.app} homepage. ` +
  `Once paired, your game saves appear automatically. Codes expire after ${PAIRING.codeTtlMinutes} minutes; ` +
  `${PAIRING.refreshNote.replace(/^./, (c) => c.toLowerCase())}`;

/**
 * Adapter (API) setup explainer for the MCP. Combines the user-facing setup
 * blurb with the AI-facing description of the `adapter_credentials` field
 * shape (so models know what to do when they see `expired` or `missing`).
 */
export const ADAPTER_SETUP_TEXT_FOR_MCP =
  `${SOURCE_KINDS.api.setupBlurb} ` +
  `Each adapter source includes an adapter_credentials array showing credential status per game. ` +
  `Status values: 'connected' (OAuth token is valid), 'expired' (token needs re-authorization; ` +
  `reconnect the game from the ${URLS.app} dashboard), 'missing' (game is linked but OAuth hasn't ` +
  `been completed yet).`;

/**
 * Map a DB source_kind enum value to the canonical SOURCE_KINDS setup blurb.
 * The DB uses `"daemon" | "adapter" | "mod"`; our schema splits "mod" into
 * the two real architectures (self-pushing vs daemon-bridged), so the DB-side
 * mod blurb mentions both flavors generically.
 */
function blurbForDbSourceKind(kind: string): string | null {
  switch (kind) {
    case "daemon":
    case "wasm":
      return SOURCE_KINDS.wasm.setupBlurb;
    case "adapter":
    case "api":
      return SOURCE_KINDS.api.setupBlurb;
    case "mod":
      return (
        `${SOURCE_KINDS.mod_selfpush.setupBlurb} ` +
        `Some moddable games (e.g. Factorio) pair the mod with the Savecraft daemon instead: ` +
        `${SOURCE_KINDS.mod_with_daemon.setupBlurb}`
      );
    default:
      return null;
  }
}

/** Setup blurb shown for a game in the supported-games listing. */
export function sourceSetupBlurbForMcp(sources: readonly string[]): string {
  const blurbs = sources
    .map((s) => blurbForDbSourceKind(s))
    .filter((b): b is string => b !== null);
  return blurbs.length > 0
    ? blurbs.join(" Additionally: ")
    : SOURCE_KINDS.wasm.setupBlurb;
}
