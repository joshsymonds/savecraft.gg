<!--
  @component
  Renders a Factorio item or fluid icon from a sprite sheet.
  Falls back to a colored label when the sprite sheet is unavailable
  or the icon name isn't in the manifest.
-->
<script lang="ts">
  import type { SpriteConfig } from "./factorio-icons";
  import { getSpriteCSS, getIconPosition } from "./factorio-icons";
  import Tooltip from "../charts/Tooltip.svelte";

  interface Props {
    /** Item/fluid internal name (e.g., "iron-plate") */
    name: string;
    /** Display size in pixels */
    size?: number;
    /** Sprite sheet config (URL, dimensions, manifest) */
    spriteConfig?: SpriteConfig | null;
  }

  let { name, size = 32, spriteConfig = null }: Props = $props();

  let hovering = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  function handleMouseEnter(e: MouseEvent) {
    hovering = true;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipX = rect.left + rect.width / 2;
    tooltipY = rect.top;
  }

  function handleMouseLeave() {
    hovering = false;
  }

  // Derive sprite CSS or fallback label
  let spriteStyle = $derived.by(() => {
    if (!spriteConfig) return null;
    return getSpriteCSS(name, spriteConfig, size);
  });

  let label = $derived.by(() => {
    if (spriteConfig) {
      const pos = getIconPosition(name, spriteConfig.manifest);
      if (pos) return pos.label;
    }
    // Fallback: kebab-case to Title Case
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  });

  // Deterministic color from item name for label mode
  let labelColor = $derived.by(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 40%, 35%)`;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="factorio-icon"
  style:width="{size}px"
  style:height="{size}px"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  {#if spriteStyle}
    <span
      class="sprite"
      style:width="{size}px"
      style:height="{size}px"
      style:background-image={spriteStyle.backgroundImage}
      style:background-position={spriteStyle.backgroundPosition}
      style:background-size={spriteStyle.backgroundSize}
    ></span>
  {:else}
    <span
      class="label-fallback"
      style:width="{size}px"
      style:height="{size}px"
      style:background-color={labelColor}
      style:font-size="{Math.max(8, size * 0.3)}px"
    >
      {label.slice(0, 3)}
    </span>
  {/if}
</span>

<Tooltip text={label} x={tooltipX} y={tooltipY} visible={hovering} />

<style>
  .factorio-icon {
    display: inline-block;
    position: relative;
    cursor: default;
  }

  .sprite {
    display: block;
    background-repeat: no-repeat;
    image-rendering: pixelated;
  }

  .label-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 2px);
    color: var(--color-text, #e8e0d0);
    font-family: var(--font-heading, monospace);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
</style>
