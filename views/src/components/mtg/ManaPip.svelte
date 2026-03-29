<!--
  @component
  Single mana symbol rendered as a CSS circle with gradient fill.
  Handles WUBRG, colorless, generic numbers, X, hybrid (W/U), and phyrexian (W/P).
-->
<script lang="ts">
  interface Props {
    /** Mana symbol: W, U, B, R, G, C, X, a number, hybrid "W/U", or phyrexian "W/P" */
    symbol: string;
    /** Circle size */
    size?: "sm" | "md" | "lg";
  }

  let { symbol, size = "md" }: Props = $props();

  const COLOR_GRADIENTS: Record<string, { bg: string; glow: string; text: string }> = {
    W: { bg: "linear-gradient(135deg, #f9f5e0 0%, #e8d9a0 50%, #c8b878 100%)", glow: "#e8d9a0", text: "#3a3020" },
    U: { bg: "linear-gradient(135deg, #1a5a9e 0%, #0e3f7a 50%, #0a2a5a 100%)", glow: "#4a8ad0", text: "#d0e8ff" },
    B: { bg: "linear-gradient(135deg, #4a3a5a 0%, #2a1a3a 50%, #1a0a2a 100%)", glow: "#8a6aaa", text: "#d8cce8" },
    R: { bg: "linear-gradient(135deg, #c83020 0%, #a01a10 50%, #701008 100%)", glow: "#e85a4a", text: "#ffe8e0" },
    G: { bg: "linear-gradient(135deg, #2a7a3a 0%, #1a5a28 50%, #0a3a18 100%)", glow: "#5abe6a", text: "#d0f0d8" },
    C: { bg: "linear-gradient(135deg, #8a8a98 0%, #6a6a78 50%, #4a4a58 100%)", glow: "#9a9aaa", text: "#e0e0e8" },
  };

  const GENERIC_STYLE = {
    bg: "linear-gradient(135deg, #7a7a88 0%, #5a5a68 50%, #3a3a48 100%)",
    glow: "#8a8a98",
    text: "#e0e0e8",
  };

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
      const ca = COLOR_GRADIENTS[a] ?? GENERIC_STYLE;
      const cb = COLOR_GRADIENTS[b] ?? GENERIC_STYLE;
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
      const c = COLOR_GRADIENTS[color] ?? GENERIC_STYLE;
      return { type: "phyrexian", label: "\u03C6", bg: c.bg, glow: c.glow, text: c.text };
    }

    // Named color
    if (COLOR_GRADIENTS[s]) {
      const c = COLOR_GRADIENTS[s];
      return { type: "single", label: s, bg: c.bg, glow: c.glow, text: c.text };
    }

    // Generic number or X
    return { type: "single", label: s, ...GENERIC_STYLE };
  });

  const SIZES = { sm: 18, md: 24, lg: 34 };
  const FONT_SIZES = { sm: 8, md: 11, lg: 15 };
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
