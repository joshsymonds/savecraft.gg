<!--
  @component
  Color-pair archetype label with WUBRG gradient background.
  Shows the archetype code (e.g. "WB") or a custom name (e.g. "Orzhov").
-->
<script lang="ts">
  import { WUBRG_ACCENT } from "./colors";

  interface Props {
    /** Color pair, e.g. ["W", "B"] */
    colors: string[];
    /** Optional display name (e.g. "Orzhov"). Falls back to joined color codes. */
    name?: string;
  }

  let { colors, name }: Props = $props();

  let label = $derived(name ?? colors.join(""));

  let bg = $derived.by(() => {
    if (colors.length === 0) return "var(--color-text-muted)";
    if (colors.length === 1) return WUBRG_ACCENT[colors[0]] ?? "var(--color-text-muted)";
    const stops = colors.map((c, i) => {
      const color = WUBRG_ACCENT[c] ?? "var(--color-text-muted)";
      const pct = (i / (colors.length - 1)) * 100;
      return `${color} ${pct}%`;
    });
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  });
</script>

<span class="archetype-label" style:--arch-bg={bg}>
  {label}
</span>

<style>
  .archetype-label {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: #fff;
    background: var(--arch-bg);
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
  }
</style>
