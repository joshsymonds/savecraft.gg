<!--
  @component
  Tabbed container for multi-query reference results.
  Renders a tab bar when multiple tabs exist; skips it for single results.
  Styled to match FilterBar chip pattern — active/inactive states with glow.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Tab {
    label: string;
  }

  interface Props {
    /** Tab definitions — one per result */
    tabs: Tab[];
    /** Callback when active tab changes */
    onchange?: (index: number) => void;
    /** Content snippet receiving the active tab index */
    children?: Snippet<[number]>;
  }

  let { tabs, onchange, children }: Props = $props();

  let activeIndex = $state(0);

  function select(index: number) {
    activeIndex = index;
    onchange?.(index);
  }
</script>

{#if tabs.length > 1}
  <div class="tab-bar">
    {#each tabs as tab, i}
      <button
        class="tab-button"
        class:active={i === activeIndex}
        onclick={() => select(i)}
      >
        {tab.label}
      </button>
    {/each}
  </div>
{/if}

{#if tabs.length > 0}
  {#key activeIndex}
    <div class="tab-content">
      {@render children?.(activeIndex)}
    </div>
  {/key}
{/if}

<style>
  .tab-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    margin-bottom: var(--space-md);
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
    border-radius: var(--radius-md);
  }

  .tab-button {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: color-mix(in srgb, var(--color-gold) 50%, var(--color-text-muted));
    background: color-mix(in srgb, var(--color-gold) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-gold) 20%, transparent);
    border-radius: var(--radius-md);
    padding: 4px 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .tab-button:hover {
    color: var(--color-gold);
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-gold) 35%, transparent);
  }

  .tab-button.active {
    color: var(--color-bg, #05071a);
    background: color-mix(in srgb, var(--color-gold) 85%, transparent);
    border-color: var(--color-gold);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-gold) 25%, transparent);
  }

  .tab-content {
    animation: fade-slide-in 0.2s ease-out both;
  }
</style>
