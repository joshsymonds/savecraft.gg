/** WUBRG color definitions shared across MTG components. */

export interface ManaColor {
  /** CSS gradient for pip backgrounds */
  bg: string;
  /** Solid glow/accent color */
  glow: string;
  /** Text color for contrast on this background */
  text: string;
}

export const WUBRG_COLORS: Record<string, ManaColor> = {
  W: { bg: "linear-gradient(135deg, #f9f5e0 0%, #e8d9a0 50%, #c8b878 100%)", glow: "#e8d9a0", text: "#3a3020" },
  U: { bg: "linear-gradient(135deg, #1a5a9e 0%, #0e3f7a 50%, #0a2a5a 100%)", glow: "#4a8ad0", text: "#d0e8ff" },
  B: { bg: "linear-gradient(135deg, #4a3a5a 0%, #2a1a3a 50%, #1a0a2a 100%)", glow: "#8a6aaa", text: "#d8cce8" },
  R: { bg: "linear-gradient(135deg, #c83020 0%, #a01a10 50%, #701008 100%)", glow: "#e85a4a", text: "#ffe8e0" },
  G: { bg: "linear-gradient(135deg, #2a7a3a 0%, #1a5a28 50%, #0a3a18 100%)", glow: "#5abe6a", text: "#d0f0d8" },
  C: { bg: "linear-gradient(135deg, #8a8a98 0%, #6a6a78 50%, #4a4a58 100%)", glow: "#9a9aaa", text: "#e0e0e8" },
};

export const GENERIC_MANA: ManaColor = {
  bg: "linear-gradient(135deg, #7a7a88 0%, #5a5a68 50%, #3a3a48 100%)",
  glow: "#8a8a98",
  text: "#e0e0e8",
};

/** Dark solid color for ColorBar segments. */
export const WUBRG_SOLID: Record<string, string> = {
  W: "#e8d9a0",
  U: "#1a5a9e",
  B: "#4a3a5a",
  R: "#c83020",
  G: "#2a7a3a",
};

/** Bright accent color for borders, header tints, and glows. Visible against dark backgrounds. */
export const WUBRG_ACCENT: Record<string, string> = {
  W: "#e8d9a0",
  U: "#6aa0e0",
  B: "#c8a0e8",
  R: "#e85a4a",
  G: "#5abe6a",
};

export const COLORLESS_SOLID = "#6a6a78";
export const COLORLESS_ACCENT = "#b0b0c0";

/** Maps MTG rarity to Badge variant. */
export const RARITY_VARIANT: Record<string, string> = {
  mythic: "legendary",
  rare: "rare",
  uncommon: "uncommon",
  common: "common",
};

/** Splits an archetype code like "WB" into color letters ["W", "B"]. */
export function archetypeColors(code: string): string[] {
  if (code === "_overall") return [];
  return code.split("");
}
