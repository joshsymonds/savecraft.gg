<!--
  @component
  Reusable dropdown menu anchored to a trigger button.
  Renders a pixel-styled button that toggles an option list below it.
  Closes on pick, outside click, or Escape.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  export interface DropdownOption {
    id: string;
    label: string;
    sublabel?: string;
  }

  let {
    label,
    options,
    onpick,
    disabled = false,
  }: {
    label: string;
    options: DropdownOption[];
    onpick: (option: DropdownOption) => void;
    disabled?: boolean;
  } = $props();

  let open = $state(false);
  let wrapRef: HTMLDivElement | undefined = $state();

  function toggle() {
    if (disabled) return;
    open = !open;
  }

  function pick(option: DropdownOption) {
    open = false;
    onpick(option);
  }

  function handleOutsideClick(event: MouseEvent) {
    if (open && wrapRef && !wrapRef.contains(event.target as Node)) {
      open = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      open = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeydown, true);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleOutsideClick, true);
    document.removeEventListener("keydown", handleKeydown, true);
  });
</script>

<div class="dropdown-wrap" bind:this={wrapRef}>
  <button class="dropdown-trigger" class:open onclick={toggle} {disabled}>
    <span class="dropdown-plus">+</span>
    {label}
  </button>
  {#if open}
    <div class="dropdown-menu">
      {#each options as option (option.id)}
        <button class="dropdown-option" onclick={() => pick(option)}>
          <span class="dropdown-option-label">{option.label}</span>
          {#if option.sublabel}
            <span class="dropdown-option-sublabel">{option.sublabel}</span>
          {/if}
        </button>
      {:else}
        <div class="dropdown-empty">No options available</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown-wrap {
    position: relative;
  }

  .dropdown-trigger {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--color-text-muted);
    background: none;
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    cursor: pointer;
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    line-height: 1;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }

  .dropdown-trigger:hover {
    color: var(--color-text);
    border-color: rgba(74, 90, 173, 0.4);
    background: rgba(74, 90, 173, 0.08);
  }

  .dropdown-trigger.open {
    color: var(--color-text);
    border-color: rgba(74, 90, 173, 0.4);
    background: rgba(74, 90, 173, 0.08);
  }

  .dropdown-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-plus {
    font-size: 12px;
    line-height: 1;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 220px;
    background: var(--color-surface, #0d1033);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 10;
    overflow: hidden;
    animation: dropdown-fade-in 0.1s ease-out;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .dropdown-option:last-child {
    border-bottom: none;
  }

  .dropdown-option:hover {
    background: rgba(74, 90, 173, 0.1);
  }

  .dropdown-option-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .dropdown-option-sublabel {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-muted);
  }

  .dropdown-empty {
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    text-align: center;
  }

  @keyframes dropdown-fade-in {
    from {
      opacity: 0;
      translate: 0 -4px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }
</style>
