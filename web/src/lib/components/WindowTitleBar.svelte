<!--
  @component
  Breadcrumb-aware title bar for source window.
  Shows clickable parent chips with ▸ separators, then the active label (not clickable).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import ParentChip from "./ParentChip.svelte";
  import StatusDot from "./StatusDot.svelte";

  export interface Parent {
    icon?: string;
    label: string;
    onclick: () => void;
  }

  let {
    parents = [],
    activeIcon,
    activeLabel,
    activeSublabel,
    statusDot,
    right,
  }: {
    parents?: Parent[];
    activeIcon?: string;
    activeLabel: string;
    activeSublabel?: string;
    statusDot?: "online" | "error" | "offline";
    right?: Snippet;
  } = $props();
</script>

<div class="title-bar">
  <div class="title-left">
    {#each parents as parent, index (index)}
      <div class="parent-sep">
        <ParentChip icon={parent.icon} label={parent.label} onclick={parent.onclick} />
        <span class="separator">▸</span>
      </div>
    {/each}

    <div class="active-group">
      {#if activeIcon}
        <span class="active-icon">{activeIcon}</span>
      {/if}
      <div>
        <div class="active-name-row">
          <span class="active-label">{activeLabel}</span>
          {#if statusDot}
            <StatusDot status={statusDot} size={7} />
          {/if}
        </div>
        {#if activeSublabel}
          <span class="active-sublabel">{activeSublabel}</span>
        {/if}
      </div>
    </div>
  </div>
  <div class="title-right">
    {#if right}
      {@render right()}
    {/if}
  </div>
</div>

<style>
  .title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
    min-height: 52px;
  }

  .title-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .parent-sep {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .separator {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .active-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .active-icon {
    font-size: 18px;
    line-height: 1;
  }

  .active-name-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .active-label {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    line-height: 1.4;
  }

  .active-sublabel {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.2;
    display: block;
    margin-top: 1px;
  }

  .title-right {
    flex-shrink: 0;
    margin-left: 12px;
  }
</style>
