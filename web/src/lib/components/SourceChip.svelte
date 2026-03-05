<!--
  @component
  Compact source status chip: name + status dot.
  Used in SourceStrip for at-a-glance connectivity health.
-->
<script lang="ts">
  import type { SourceStatus } from "$lib/types/source";

  import StatusDot from "./StatusDot.svelte";

  let {
    name,
    status,
    lastSeen,
    onclick,
  }: {
    name: string;
    status: SourceStatus;
    lastSeen: string;
    onclick?: () => void;
  } = $props();
</script>

<button
  class="source-chip"
  class:offline={status === "offline"}
  class:error={status === "error"}
  {onclick}
>
  <StatusDot {status} size={7} />
  <span class="chip-name">{name}</span>
  {#if status === "offline"}
    <span class="chip-seen">{lastSeen}</span>
  {/if}
</button>

<style>
  .source-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 3px;
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.12);
    cursor: pointer;
    transition:
      background 0.1s,
      border-color 0.15s;
  }

  .source-chip:hover {
    background: rgba(74, 90, 173, 0.15);
    border-color: rgba(74, 90, 173, 0.25);
  }

  .source-chip:focus-visible {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }

  .source-chip.offline {
    opacity: 0.5;
  }

  .source-chip.error {
    border-color: rgba(232, 90, 90, 0.2);
  }

  .chip-name {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .chip-seen {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
