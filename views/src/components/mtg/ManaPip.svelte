<!--
  @component
  Single mana symbol rendered as a CSS circle with gradient fill.
  Handles WUBRG, colorless, generic numbers, X, hybrid (W/U), and phyrexian (W/P).
-->
<script lang="ts">
  import { WUBRG_COLORS, GENERIC_MANA } from "./colors";

  interface Props {
    /** Mana symbol: W, U, B, R, G, C, X, a number, hybrid "W/U", or phyrexian "W/P" */
    symbol: string;
    /** Circle size */
    size?: "sm" | "md" | "lg" | "xl";
  }

  let { symbol, size = "md" }: Props = $props();

  type PipInfo =
    | { type: "single"; label: string; bg: string; glow: string; text: string }
    | {
        type: "hybrid";
        topColor: string;
        bottomColor: string;
        topGlow: string;
        bottomGlow: string;
        label: string;
        text: string;
      }
    | { type: "phyrexian"; label: string; bg: string; glow: string; text: string };

  let pip = $derived.by((): PipInfo => {
    const s = symbol.trim().toUpperCase();

    // Hybrid: "W/U", "B/G", etc. — but NOT phyrexian "W/P"
    if (s.includes("/") && !s.endsWith("/P")) {
      const [a, b] = s.split("/");
      const ca = WUBRG_COLORS[a] ?? GENERIC_MANA;
      const cb = WUBRG_COLORS[b] ?? GENERIC_MANA;
      return {
        type: "hybrid",
        topColor: ca.glow,
        bottomColor: cb.glow,
        topGlow: ca.glow,
        bottomGlow: cb.glow,
        label: `${a}/${b}`,
        text: "#e0e0e8",
      };
    }

    // Phyrexian: "W/P", "U/P", "P"
    if (s === "P" || s.endsWith("/P")) {
      const color = s === "P" ? "C" : s.split("/")[0];
      const c = WUBRG_COLORS[color] ?? GENERIC_MANA;
      return { type: "phyrexian", label: "\u03C6", bg: c.bg, glow: c.glow, text: c.text };
    }

    // Named color
    if (WUBRG_COLORS[s]) {
      const c = WUBRG_COLORS[s];
      return { type: "single", label: s, bg: c.bg, glow: c.glow, text: c.text };
    }

    // Generic number or X
    return { type: "single", label: s, ...GENERIC_MANA };
  });

  const SIZES = { sm: 18, md: 24, lg: 34, xl: 64 };
  const FONT_SIZES = { sm: 8, md: 11, lg: 15, xl: 28 };
  let px = $derived(SIZES[size]);
  let fontSize = $derived(FONT_SIZES[size]);

  // Unique ID for SVG clip paths (avoid collisions when multiple hybrids render)
  let uid = $derived(`pip-${symbol.replace(/[^a-zA-Z0-9]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`);
</script>

{#if pip.type === "hybrid"}
  <span
    class="pip hybrid"
    class:sm={size === "sm"}
    class:lg={size === "lg"}
    style:--pip-size="{px}px"
    style:--pip-font="{fontSize}px"
    style:--pip-glow={pip.topGlow}
    title={pip.label}
    aria-label="Hybrid mana: {pip.label}"
  >
    <svg viewBox="0 0 100 100" width={px} height={px} aria-hidden="true">
      <defs>
        <clipPath id="top-{uid}">
          <polygon points="0,0 100,0 0,100" />
        </clipPath>
        <clipPath id="btm-{uid}">
          <polygon points="100,0 100,100 0,100" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={pip.topColor} clip-path="url(#top-{uid})" />
      <circle cx="50" cy="50" r="48" fill={pip.bottomColor} clip-path="url(#btm-{uid})" />
      <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(0,0,0,0.25)" stroke-width="2" />
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="3" />
    </svg>
  </span>
{:else}
  <span
    class="pip"
    class:sm={size === "sm"}
    class:lg={size === "lg"}
    class:phyrexian={pip.type === "phyrexian"}
    style:--pip-size="{px}px"
    style:--pip-font="{fontSize}px"
    style:--pip-bg={pip.bg}
    style:--pip-glow={pip.glow}
    style:--pip-text={pip.text}
    title={pip.label}
    aria-label="{pip.type === 'phyrexian' ? 'Phyrexian ' : ''}mana: {pip.label}"
  >
    {pip.label}
  </span>
{/if}

<style>
  /* Pixel-circle clip path: stepped edges evoke pixel art while the text stays crisp */
  .pip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--pip-size);
    height: var(--pip-size);
    min-width: var(--pip-size);
    background: var(--pip-bg);
    color: var(--pip-text);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: var(--pip-font);
    line-height: 1;
    clip-path: polygon(
      /* pixel circle: square with rectangular corner notches */
      20% 0%, 80% 0%,
      80% 0%, 80% 10%,
      80% 10%, 100% 10%,
      100% 10%, 100% 90%,
      100% 90%, 80% 90%,
      80% 90%, 80% 100%,
      80% 100%, 20% 100%,
      20% 100%, 20% 90%,
      20% 90%, 0% 90%,
      0% 90%, 0% 10%,
      0% 10%, 20% 10%,
      20% 10%, 20% 0%
    );
    box-shadow:
      0 0 8px color-mix(in srgb, var(--pip-glow) 35%, transparent);
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
    user-select: none;
    flex-shrink: 0;
  }

  .pip.phyrexian {
    font-style: italic;
  }

  .pip.hybrid {
    background: transparent;
    box-shadow: 0 0 6px color-mix(in srgb, var(--pip-glow) 40%, transparent);
    overflow: hidden;
  }

  .pip.hybrid svg {
    display: block;
  }
</style>
