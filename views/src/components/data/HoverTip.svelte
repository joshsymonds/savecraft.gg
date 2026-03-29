<!--
  @component
  Tooltip that appears above its parent element on hover.
  Wrap any element — the tooltip content appears above it when hovered.
  Supports plain text or structured content via the tip snippet.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Plain text tooltip (ignored if tip snippet is provided) */
    text?: string;
    /** Rich tooltip content */
    tip?: Snippet;
    /** Slot content — the hover target */
    children?: Snippet;
  }

  let { text, tip, children }: Props = $props();

  let visible = $state(false);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="hover-tip-anchor"
  onmouseenter={() => (visible = true)}
  onmouseleave={() => (visible = false)}
>
  {@render children?.()}
  {#if visible && (text || tip)}
    <span class="hover-tip">
      {#if tip}
        {@render tip()}
      {:else if text}
        {text}
      {/if}
    </span>
  {/if}
</span>

<style>
  .hover-tip-anchor {
    position: relative;
    display: inline-flex;
  }

  .hover-tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    width: max-content;
    max-width: min(400px, 90vw);
    line-height: 1.4;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    animation: hover-tip-in 0.15s ease-out;
  }

  @keyframes hover-tip-in {
    from { opacity: 0; transform: translateX(-50%) translateY(2px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
