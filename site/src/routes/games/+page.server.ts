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

  const iconPath = resolve(dir, cfg.icon);
  const isSvg = cfg.icon.endsWith(".svg");
  let iconHtml: string;
  if (isSvg) {
    iconHtml = readFileSync(iconPath, "utf-8");
  } else {
    const buf = readFileSync(iconPath);
    const ext = cfg.icon.split(".").pop() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    const b64 = buf.toString("base64");
    iconHtml = `<img src="data:${mime};base64,${b64}" alt="" width="32" height="32" />`;
  }

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
    iconSvg: iconHtml,
    referenceModules,
  };
}

export function load() {
  return {
    games: [loadPlugin("d2r"), loadPlugin("sdv")],
  };
}
