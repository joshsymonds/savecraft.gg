import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";

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

interface PluginToml {
  game_id: string;
  source: string;
  icon: string;
  name: string;
  description: string;
  channel: string;
  coverage: string;
  limitations?: string[];
  reference?: {
    modules?: Record<string, { name: string; description: string }>;
  };
}

const PLUGINS_DIR = resolve("../plugins");

function loadPlugin(gameDir: string): GameInfo {
  const dir = resolve(PLUGINS_DIR, gameDir);
  const toml = readFileSync(resolve(dir, "plugin.toml"), "utf-8");
  const cfg = parse(toml) as unknown as PluginToml;

  const iconSvg = readFileSync(resolve(dir, cfg.icon), "utf-8");

  const referenceModules: ReferenceModule[] = cfg.reference?.modules
    ? Object.values(cfg.reference.modules).map((m) => ({
        name: m.name,
        description: m.description,
      }))
    : [];

  return {
    gameId: cfg.game_id,
    source: cfg.source,
    name: cfg.name,
    description: cfg.description,
    channel: cfg.channel,
    coverage: cfg.coverage,
    limitations: cfg.limitations ?? [],
    iconSvg,
    referenceModules,
  };
}

export function load() {
  return {
    games: [loadPlugin("d2r"), loadPlugin("sdv")],
  };
}
