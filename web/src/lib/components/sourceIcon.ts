import type { Source } from "$lib/types/source";

const ICON_BASE = "/icons/sources";

type SourceIconInput = Pick<Source, "sourceKind" | "platform" | "device" | "games">;

/**
 * Resolve the icon URL for a source based on its kind, platform, device, and games.
 */
export function getSourceIconUrl(source: SourceIconInput): string {
  if (source.sourceKind === "adapter") {
    return `${ICON_BASE}/adapter.png`;
  }

  if (source.device === "steam_deck") {
    return `${ICON_BASE}/steam-deck.png`;
  }

  switch (source.platform) {
    case "windows":
      return `${ICON_BASE}/windows.png`;
    case "linux":
      return `${ICON_BASE}/linux.png`;
    case "darwin":
      return `${ICON_BASE}/macos.png`;
    default:
      return `${ICON_BASE}/generic.png`;
  }
}
