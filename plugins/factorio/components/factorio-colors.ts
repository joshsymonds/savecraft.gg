/** Factorio item, module, and belt color palettes for flow visualizations. */

/** Curated item colors for common Factorio items. */
const ITEM_COLORS: Record<string, string> = {
  // Ores
  "iron-ore": "#8aa0b8",
  "copper-ore": "#d4874e",
  "coal": "#4a4a4e",
  "stone": "#b8a880",
  "uranium-ore": "#5abe5a",

  // Plates
  "iron-plate": "#9ab0c8",
  "copper-plate": "#e09858",
  "steel-plate": "#b8c0c8",
  "stone-brick": "#c0a878",

  // Intermediates
  "copper-cable": "#e8a060",
  "iron-stick": "#8898a8",
  "iron-gear-wheel": "#8898a8",
  "electronic-circuit": "#5aaa5a",
  "advanced-circuit": "#e05050",
  "processing-unit": "#4a8aea",
  "engine-unit": "#a0a8b0",
  "electric-engine-unit": "#6aaae0",
  "battery": "#8070a0",
  "plastic-bar": "#e0e0e0",
  "sulfur": "#e8d84e",
  "explosives": "#e85a3a",
  "low-density-structure": "#e8c84e",
  "rocket-fuel": "#e88840",
  "rocket-control-unit": "#4a8aea",

  // Science packs
  "automation-science-pack": "#e05050",
  "logistic-science-pack": "#50c050",
  "military-science-pack": "#404040",
  "chemical-science-pack": "#40b0e0",
  "production-science-pack": "#b060d0",
  "utility-science-pack": "#e8c84e",
  "space-science-pack": "#f0f0f0",

  // Fluids
  "water": "#4090d0",
  "crude-oil": "#303030",
  "heavy-oil": "#8a4020",
  "light-oil": "#d4a040",
  "petroleum-gas": "#60b0a0",
  "lubricant": "#40a050",
  "sulfuric-acid": "#c0b040",
  "steam": "#c8c8d0",
};

/** Get an item's flow band color. Uses curated palette with hash fallback. */
export function getItemColor(name: string): string {
  if (ITEM_COLORS[name]) return ITEM_COLORS[name];

  // Deterministic hash fallback — warm-tinted hues
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

/** Module type → fill color for slot indicators. */
const MODULE_COLORS: Record<string, string> = {
  "productivity-module": "#5abe8a",
  "productivity-module-2": "#5abe8a",
  "productivity-module-3": "#5abe8a",
  "speed-module": "#5ab0f0",
  "speed-module-2": "#5ab0f0",
  "speed-module-3": "#5ab0f0",
  "efficiency-module": "#e85a5a",
  "efficiency-module-2": "#e85a5a",
  "efficiency-module-3": "#e85a5a",
  "quality-module": "#b47aee",
  "quality-module-2": "#b47aee",
  "quality-module-3": "#b47aee",
};

/** Get module fill color by module name. Returns muted gray for unknown modules. */
export function getModuleColor(name: string): string {
  return MODULE_COLORS[name] ?? "#a0a8cc";
}

/** Get module short label (e.g., "P3", "S2"). */
export function getModuleLabel(name: string): string {
  const match = name.match(/^(productivity|speed|efficiency|quality)-module(?:-(\d))?$/);
  if (!match) return name.slice(0, 2).toUpperCase();
  const prefix = match[1][0].toUpperCase(); // P, S, E, Q
  const tier = match[2] ?? "1";
  return `${prefix}${tier}`;
}

/** Belt tier → color. */
const BELT_COLORS: Record<string, string> = {
  yellow: "#e8c84e",
  red: "#e85a5a",
  blue: "#4a9aea",
  green: "#5abe8a",
  turbo: "#5abe8a",
};

/** Get belt tier dot color. */
export function getBeltTierColor(tier: string): string {
  return BELT_COLORS[tier] ?? "#a0a8cc";
}
