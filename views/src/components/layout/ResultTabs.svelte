<!--
  @component
  Tabbed container for multi-query reference results.
  Renders a tab bar when multiple tabs exist; skips it for single results.
  Designed to sit inside a Panel — shares the Panel's background and border context.
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

  function onKeyDown(event: KeyboardEvent) {
    if (tabs.length <= 1) return;
    let next = activeIndex;
    if (event.key === "ArrowRight") {
      next = (activeIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (activeIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    select(next);
    const wrapper = event.currentTarget as HTMLElement;
    const buttons = wrapper.querySelectorAll<HTMLButtonElement>(".tab-button");
    buttons[next]?.focus();
  }
</script>

{#if tabs.length > 1}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="tab-bar" role="tablist" onkeydown={onKeyDown}>
    {#each tabs as tab, i}
      <button
        class="tab-button"
        class:active={i === activeIndex}
        role="tab"
        aria-selected={i === activeIndex}
        tabindex={i === activeIndex ? 0 : -1}
        onclick={() => select(i)}
      >
        <span class="tab-index">{i + 1}</span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </div>
  <div class="tab-divider" aria-hidden="true">
    <div class="tab-divider-glow"></div>
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
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-xs) var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 25%, transparent);
    border-radius: var(--radius-md);
    margin-bottom: 0;
  }

  .tab-divider {
    position: relative;
    height: 1px;
    margin: var(--space-sm) 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 30%, transparent) 20%,
      color-mix(in srgb, var(--color-gold) 30%, transparent) 80%,
      transparent 100%
    );
  }

  .tab-divider-glow {
    position: absolute;
    inset: -2px 10%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 25%,
      color-mix(in srgb, var(--color-gold) 12%, transparent) 50%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 75%,
      transparent 100%
    );
    filter: blur(2px);
    animation: glow-pulse 4s ease-in-out infinite;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
    position: relative;
  }

  .tab-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
  }

  .tab-index {
    font-family: var(--font-pixel);
    font-size: 10px;
    letter-spacing: 1px;
    color: color-mix(in srgb, var(--color-gold) 25%, transparent);
    transition: all 0.2s ease;
  }

  .tab-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-muted);
    transition: all 0.2s ease;
  }

  .tab-button:hover {
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-gold) 15%, transparent);
  }

  .tab-button:hover .tab-label {
    color: var(--color-text-dim);
  }

  .tab-button:hover .tab-index {
    color: color-mix(in srgb, var(--color-gold) 50%, transparent);
  }

  .tab-button.active {
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-gold) 30%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-gold) 10%, transparent);
  }

  .tab-button.active .tab-label {
    color: var(--color-text);
    font-weight: 700;
  }

  .tab-button.active .tab-index {
    color: var(--color-gold);
    text-shadow: 0 0 6px color-mix(in srgb, var(--color-gold) 40%, transparent);
  }

  .tab-content {
    padding-top: var(--space-md);
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
