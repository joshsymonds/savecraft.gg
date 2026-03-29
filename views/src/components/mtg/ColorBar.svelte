<!--
  @component
  Thin horizontal bar showing WUBRG color identity as segments.
  Single color renders solid; multiple colors render as an even gradient.
  Empty/colorless renders grey.
-->
<script lang="ts">
  import { WUBRG_SOLID, COLORLESS_SOLID } from "./colors";

  interface Props {
    /** Color identity: subset of W, U, B, R, G */
    colors: string[];
    /** Bar height in pixels (default: 3) */
    height?: number;
  }

  let { colors, height = 3 }: Props = $props();

  let bg = $derived.by(() => {
    if (colors.length === 0) return COLORLESS_SOLID;
    if (colors.length === 1) return WUBRG_SOLID[colors[0]] ?? COLORLESS_SOLID;
    const stops = colors.map((c, i) => {
      const color = WUBRG_SOLID[c] ?? COLORLESS_SOLID;
      const start = (i / colors.length) * 100;
      const end = ((i + 1) / colors.length) * 100;
      return `${color} ${start}%, ${color} ${end}%`;
    });
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  });
</script>

<div
  class="color-bar"
  style:--bar-bg={bg}
  style:--bar-height="{height}px"
></div>

<style>
  .color-bar {
    width: 100%;
    height: var(--bar-height);
    background: var(--bar-bg);
  }
</style>
