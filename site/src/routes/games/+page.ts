import d2rManifest from "../../../../plugins/d2r/manifest.json";
import d2rIcon from "../../../../plugins/d2r/icon.svg?raw";
import sdvManifest from "../../../../plugins/sdv/manifest.json";
import sdvIcon from "../../../../plugins/sdv/icon.svg?raw";

interface ReferenceModule {
  name: string;
  description: string;
}

export interface GameInfo {
  gameId: string;
  source: string;
  name: string;
  description: string;
  channel: string;
  coverage: string;
  limitations: string[];
  iconSvg: string;
  referenceModules: ReferenceModule[];
}

function extractModules(reference?: ManifestInput["reference"]): ReferenceModule[] {
  if (!reference?.modules) return [];
  return Object.values(reference.modules).map((m) => ({
    name: m.name,
    description: m.description,
  }));
}

interface ManifestInput {
  game_id: string;
  source: string;
  name: string;
  description: string;
  channel: string;
  coverage: string;
  limitations?: string[];
  reference?: { modules?: Record<string, { name: string; description: string }> } | null;
}

function toGameInfo(manifest: ManifestInput, iconSvg: string): GameInfo {
  return {
    gameId: manifest.game_id,
    source: manifest.source,
    name: manifest.name,
    description: manifest.description,
    channel: manifest.channel,
    coverage: manifest.coverage,
    limitations: manifest.limitations ?? [],
    iconSvg,
    referenceModules: extractModules(manifest.reference),
  };
}

export function load() {
  return {
    games: [toGameInfo(d2rManifest, d2rIcon), toGameInfo(sdvManifest, sdvIcon)],
  };
}
