/**
 * Count-up tween for Stat values.
 *
 * Pure parse/format helpers turn a display value like "85.5%" or "1,137"
 * into a tweenable number plus the formatting needed to render every
 * intermediate frame in the same shape. Values that aren't a single
 * numeric run (letter grades, ratios) don't tween.
 */

export interface StatValueParts {
  /** Non-numeric lead-in, e.g. "~" */
  prefix: string;
  /** The numeric value to tween toward */
  num: number;
  /** Decimal places to preserve at every frame */
  decimals: number;
  /** Whether the source used thousands separators */
  grouped: boolean;
  /** Non-numeric tail, e.g. "%" or "/min" */
  suffix: string;
}

/** Exactly one numeric run, with optional non-digit prefix/suffix.
    The suffix must be digit-free so ratios like "1:312" are rejected. */
const STAT_VALUE = /^([^\d-]*?)(-?\d[\d,]*(?:\.(\d+))?)([^\d]*)$/;

export function parseStatValue(value: string | number): StatValueParts | null {
  const str = typeof value === "number" ? String(value) : value;
  const match = STAT_VALUE.exec(str);
  if (!match) return null;

  const [, prefix, numStr, fraction, suffix] = match;
  const num = Number(numStr.replaceAll(",", ""));
  if (!Number.isFinite(num)) return null;

  return {
    prefix,
    num,
    decimals: fraction?.length ?? 0,
    grouped: numStr.includes(","),
    suffix,
  };
}

export function formatStatValue(parts: StatValueParts, n: number): string {
  const formatted = parts.grouped
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: parts.decimals,
        maximumFractionDigits: parts.decimals,
      })
    : n.toFixed(parts.decimals);
  return `${parts.prefix}${formatted}${parts.suffix}`;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tween a stat value from 0 to its target, calling `set` with the formatted
 * string each frame. Returns a cancel function. Non-numeric values and
 * reduced-motion environments render the final value immediately.
 */
export function countUp(
  value: string | number,
  set: (display: string) => void,
  durationMs = 650,
): () => void {
  const parts = parseStatValue(value);
  if (!parts || prefersReducedMotion()) {
    set(String(value));
    return () => {};
  }

  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min((now - start) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    // Land exactly on the source string at t=1 — no float drift.
    set(t < 1 ? formatStatValue(parts, parts.num * eased) : String(value));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
