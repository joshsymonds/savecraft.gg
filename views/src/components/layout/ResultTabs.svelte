<!--
  @component
  Tabbed container for multi-query reference results.
  Renders a tab bar when multiple tabs exist; skips it for single results.
  Retro-styled with underline indicator, gradient hover, and pixel-font numbering.
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

  // Clamp activeIndex when tabs array changes (e.g. new results arrive)
  $effect(() => {
    if (activeIndex >= tabs.length && tabs.length > 0) {
      activeIndex = 0;
    }
  });

  function select(index: number) {
    activeIndex = index;
    onchange?.(index);
  }
</script>

{#if tabs.length > 1}
  <div class="tab-bar" role="tablist">
    {#each tabs as tab, i}
      <button
        class="tab-button"
        class:active={i === activeIndex}
        role="tab"
        aria-selected={i === activeIndex}
        onclick={() => select(i)}
      >
        <span class="tab-index">{i + 1}</span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
    <div class="tab-track" aria-hidden="true">
      <div class="tab-glow"></div>
    </div>
  </div>
{/if}

{#if tabs.length > 0}
  {#key activeIndex}
    <div class="tab-content" role="tabpanel">
      {@render children?.(activeIndex)}
    </div>
  {/key}
{/if}

<style>
  .tab-bar {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
    position: relative;
    padding-bottom: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab-track {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-border) 40%, transparent) 10%,
      color-mix(in srgb, var(--color-border) 40%, transparent) 90%,
      transparent 100%
    );
  }

  .tab-glow {
    position: absolute;
    inset: -2px 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 6%, transparent) 25%,
      color-mix(in srgb, var(--color-gold) 10%, transparent) 50%,
      color-mix(in srgb, var(--color-gold) 6%, transparent) 75%,
      transparent 100%
    );
    filter: blur(1px);
    animation: glow-pulse 4s ease-in-out infinite;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
    position: relative;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tab-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .tab-index {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1px;
    color: color-mix(in srgb, var(--color-gold) 30%, transparent);
    transition: all 0.2s ease;
  }

  .tab-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-muted);
    transition: all 0.2s ease;
  }

  .tab-button:hover .tab-label {
    color: var(--color-text-dim);
  }

  .tab-button:hover .tab-index {
    color: color-mix(in srgb, var(--color-gold) 60%, transparent);
  }

  .tab-button:hover {
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 4%, transparent) 100%
    );
  }

  .tab-button.active {
    border-bottom-color: var(--color-gold);
  }

  .tab-button.active .tab-label {
    color: var(--color-text);
  }

  .tab-button.active .tab-index {
    color: var(--color-gold);
    text-shadow: 0 0 8px color-mix(in srgb, var(--color-gold) 40%, transparent);
  }

  .tab-button.active::after {
    content: "";
    position: absolute;
    bottom: -2px;
    left: 20%;
    right: 20%;
    height: 4px;
    background: var(--color-gold);
    filter: blur(4px);
    opacity: 0.4;
  }

  .tab-content {
    animation: tab-enter 0.25s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  @keyframes tab-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes glow-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
