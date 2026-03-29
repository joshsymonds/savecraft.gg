<!--
  @component
  Collapsible toggle row with rotating arrow indicator.
  Click to expand/collapse children content.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Toggle label text */
    label: string;
    /** Reduce opacity for de-emphasized toggles (e.g. removed saves) */
    muted?: boolean;
    /** Whether the toggle is expanded (bindable) */
    open?: boolean;
    /** Slot content shown when expanded */
    children?: Snippet;
  }

  let { label, muted = false, open = $bindable(false), children }: Props = $props();
</script>

<div class="collapse-toggle" class:muted>
  <button
    class="toggle-row"
    onclick={() => (open = !open)}
    type="button"
  >
    <span class="toggle-arrow" class:expanded={open}>&#x25B8;</span>
    <span class="toggle-label">{label}</span>
  </button>
  {#if open}
    <div class="toggle-content">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .collapse-toggle.muted {
    opacity: 0.6;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    text-align: left;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
  }

  .toggle-row:hover {
    background: color-mix(in srgb, var(--color-border) 10%, transparent);
  }

  .toggle-arrow {
    font-size: 10px;
    color: var(--color-text-muted);
    transition: transform 0.15s;
    display: inline-block;
  }

  .toggle-arrow.expanded {
    transform: rotate(90deg);
  }

  .toggle-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .toggle-content {
    padding: var(--space-xs) var(--space-sm);
    animation: fade-in 0.2s ease-out;
  }
</style>
