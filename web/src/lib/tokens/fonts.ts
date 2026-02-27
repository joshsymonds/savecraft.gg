/** Font family tokens. */

export const fonts = {
  pixel: "'Press Start 2P', monospace",
  body: "'VT323', monospace",
} as const;

export type FontToken = keyof typeof fonts;
