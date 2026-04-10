/** PoE color definitions shared across Path of Exile components. */

/** Gem attribute colors — PoE gems are colored by attribute requirement.
 *  Bright solid colors — these are primary visual elements that must pop on dark backgrounds. */
export const GEM_COLORS = {
  str: { bg: "#d04030", glow: "#ef6050", text: "#fff0e8" },
  dex: { bg: "#30a040", glow: "#50c060", text: "#e0f8e0" },
  int: { bg: "#3080d0", glow: "#50a0f0", text: "#e0f0ff" },
  white: { bg: "#a0a0b0", glow: "#c0c0d0", text: "#f0f0f8" },
} as const;

/** PoE item rarity colors — these differ from the generic rarity palette. */
export const RARITY_COLORS = {
  NORMAL: "var(--color-rarity-common)",
  MAGIC: "#8888ff",
  RARE: "#ffff77",
  UNIQUE: "#af6025",
} as const;

/** Maps PoE rarity string (from PoB) to Badge variant + custom color override. */
export function rarityStyle(rarity: string): { variant: string; color?: string } {
  switch (rarity?.toUpperCase()) {
    case "UNIQUE":
      return { variant: "legendary" };
    case "RARE":
      // PoE rare is yellow — use warning variant which is closest
      return { variant: "warning" };
    case "MAGIC":
      // PoE magic is blue
      return { variant: "info" };
    case "NORMAL":
    default:
      return { variant: "common" };
  }
}

/** PoE class accent colors for Panel theming. */
export const CLASS_ACCENTS: Record<string, string> = {
  Witch: "#8a6aaa",
  Shadow: "#4a8ad0",
  Ranger: "#5abe6a",
  Duelist: "#e8a430",
  Marauder: "#e85a4a",
  Templar: "#e8d9a0",
  Scion: "#b0b0c0",
};

/** Ascendancy → parent class mapping for accent color lookup. */
export const ASCENDANCY_CLASS: Record<string, string> = {
  // Witch
  Necromancer: "Witch",
  Elementalist: "Witch",
  Occultist: "Witch",
  // Shadow
  Assassin: "Shadow",
  Saboteur: "Shadow",
  Trickster: "Shadow",
  // Ranger
  Deadeye: "Ranger",
  Raider: "Ranger",
  Pathfinder: "Ranger",
  // Duelist
  Slayer: "Duelist",
  Gladiator: "Duelist",
  Champion: "Duelist",
  // Marauder
  Juggernaut: "Marauder",
  Berserker: "Marauder",
  Chieftain: "Marauder",
  // Templar
  Inquisitor: "Templar",
  Hierophant: "Templar",
  Guardian: "Templar",
  // Scion
  Ascendant: "Scion",
};

/** Get the accent color for a class or ascendancy. */
export function classAccent(classOrAscendancy: string): string {
  const parentClass = ASCENDANCY_CLASS[classOrAscendancy] ?? classOrAscendancy;
  return CLASS_ACCENTS[parentClass] ?? "var(--color-gold)";
}
