/** Factorio icon sprite sheet manifest and lookup helpers. */

export interface SpritePosition {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface SpriteConfig {
  /** URL to the sprite sheet PNG (e.g., R2 URL or local path) */
  url: string;
  /** Total width of the sprite sheet in pixels */
  sheetWidth: number;
  /** Total height of the sprite sheet in pixels */
  sheetHeight: number;
  /** Manifest mapping item name → position + label */
  manifest: Record<string, SpritePosition>;
}

/**
 * Look up an icon's sprite position and display label.
 * Returns null if the icon name isn't in the manifest.
 */
export function getIconPosition(
  name: string,
  manifest: Record<string, SpritePosition>,
): SpritePosition | null {
  return manifest[name] ?? null;
}

/**
 * Get CSS background properties for rendering a sprite icon.
 * Returns null if the icon isn't in the manifest.
 */
export function getSpriteCSS(
  name: string,
  config: SpriteConfig,
  displaySize: number,
): { backgroundImage: string; backgroundPosition: string; backgroundSize: string } | null {
  const pos = config.manifest[name];
  if (!pos) return null;

  const scale = displaySize / pos.w;
  return {
    backgroundImage: `url(${config.url})`,
    backgroundPosition: `-${pos.x * scale}px -${pos.y * scale}px`,
    backgroundSize: `${config.sheetWidth * scale}px ${config.sheetHeight * scale}px`,
  };
}
