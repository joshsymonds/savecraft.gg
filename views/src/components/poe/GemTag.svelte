<!--
  @component
  Inline gem indicator for Path of Exile skill/support gems.
  Shows gem name with a colored dot indicating gem type.
  Support gems are visually distinct (dimmer, italic).
-->
<script lang="ts">
  import { GEM_COLORS } from "./colors";

  /** Wire format gem colors: R(str), G(dex), B(int), W(neutral) */
  const COLOR_MAP: Record<string, keyof typeof GEM_COLORS> = {
    R: "str", G: "dex", B: "int", W: "white",
  };

  interface Props {
    /** Gem display name */
    name: string;
    /** Gem attribute color: R(str), G(dex), B(int), W(neutral) */
    color?: string;
    /** Whether this is a support gem */
    support?: boolean;
    /** Gem level (shown if provided) */
    level?: number;
    /** Gem quality (shown if provided) */
    quality?: number;
    /** Whether the gem is enabled in the build */
    enabled?: boolean;
  }

  let { name, color = "W", support = false, level, quality, enabled = true }: Props = $props();

  let gemColor = $derived(GEM_COLORS[COLOR_MAP[color] ?? "white"]);
  let hasDetail = $derived(level != null || (quality != null && quality > 0));
</script>

<span class="gem-tag" class:support class:disabled={!enabled}>
  <span class="dot" style:background={gemColor.bg} style:box-shadow="0 0 4px {gemColor.glow}"></span>
  <span class="name">{name}</span>
  {#if hasDetail}
    <span class="detail">
      {#if level != null}{level}{/if}{#if quality != null && quality > 0}/{quality}%{/if}
    </span>
  {/if}
</span>

<style>
  .gem-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.3;
  }

  .gem-tag.support {
    font-style: italic;
    opacity: 0.8;
  }

  .gem-tag.disabled {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .name {
    white-space: nowrap;
  }

  .detail {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }
</style>
