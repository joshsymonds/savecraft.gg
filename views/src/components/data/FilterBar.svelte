<!--
  @component
  Row of toggleable filter chips.
  Used above DataTable, Timeline, RankedList to filter displayed data.
-->
<script lang="ts">
  interface Filter {
    label: string;
    value: string;
    color?: string;
  }

  interface Props {
    /** Available filters */
    filters: Filter[];
    /** Currently active filter values */
    active: string[];
    /** Callback when active filters change */
    onchange: (activeValues: string[]) => void;
    /** Allow multiple active filters (default: true) */
    multiSelect?: boolean;
  }

  let { filters, active, onchange, multiSelect = true }: Props = $props();

  function toggle(value: string) {
    const isActive = active.includes(value);
    if (multiSelect) {
      onchange(isActive ? active.filter((v) => v !== value) : [...active, value]);
    } else {
      onchange(isActive ? [] : [value]);
    }
  }
</script>

<div class="filter-bar">
  <span class="filter-label">{multiSelect ? "Filter" : "Select"}</span>
  <div class="filter-chips">
    {#each filters as filter}
      <button
        class="filter-chip"
        class:active={active.includes(filter.value)}
        style:--chip-color={filter.color ?? "var(--color-gold)"}
        onclick={() => toggle(filter.value)}
      >
        <span class="chip-indicator" class:checked={active.includes(filter.value)} class:radio={!multiSelect}></span>
        {filter.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
    border-radius: var(--radius-md);
    padding: var(--space-xs) var(--space-sm);
  }

  .filter-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .filter-chip {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: color-mix(in srgb, var(--chip-color) 50%, var(--color-text-muted));
    background: color-mix(in srgb, var(--chip-color) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--chip-color) 20%, transparent);
    border-radius: var(--radius-md);
    padding: 4px 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .filter-chip:hover {
    color: var(--chip-color);
    background: color-mix(in srgb, var(--chip-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--chip-color) 35%, transparent);
  }

  .chip-indicator {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
    border: 1.5px solid color-mix(in srgb, var(--chip-color) 40%, transparent);
    flex-shrink: 0;
    position: relative;
    transition: all 0.15s ease;
  }

  .chip-indicator.radio {
    border-radius: 50%;
  }

  .chip-indicator.checked {
    background: var(--chip-color);
    border-color: var(--chip-color);
  }

  /* Checkmark for multi-select */
  .chip-indicator.checked:not(.radio)::after {
    content: "";
    position: absolute;
    left: 3px;
    top: 1px;
    width: 4px;
    height: 7px;
    border: solid var(--color-bg, #05071a);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* Dot for single-select radio */
  .chip-indicator.radio.checked::after {
    content: "";
    position: absolute;
    inset: 0;
    margin: auto;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-bg, #05071a);
  }

  .filter-chip.active {
    color: var(--color-bg, #05071a);
    background: color-mix(in srgb, var(--chip-color) 85%, transparent);
    border-color: var(--chip-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--chip-color) 25%, transparent);
  }
</style>
