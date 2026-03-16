<!--
  @component
  Source card: displays a single source with platform/device icon,
  hostname, and connection status. Used in SourceCardGrid.
-->
<script lang="ts">
  import type { Source } from "$lib/types/source";

  import { getSourceIconUrl } from "./source-icon";
  import StatusDot from "./StatusDot.svelte";

  let {
    source,
    onclick,
  }: {
    source: Source;
    onclick?: () => void;
  } = $props();

  let iconUrl = $derived(getSourceIconUrl(source));
  let displayName = $derived((source.hostname ?? source.name).toUpperCase());
  let statusLabel = $derived.by(() => {
    if (source.status === "online") return "Online";
    if (source.status === "error") return "Error";
    if (source.status === "linked")
      return source.lastSeen ? `Linked · ${source.lastSeen}` : "Linked";
    return source.lastSeen || "Offline";
  });
</script>

<button
  class="source-card"
  class:offline={source.status === "offline"}
  class:error={source.status === "error"}
  {onclick}
>
  <img class="source-icon" src={iconUrl} alt={displayName} width="48" height="48" />
  <span class="source-name">{displayName}</span>
  <span class="source-status">
    <StatusDot status={source.status} size={6} />
    <span class="status-text">{statusLabel}</span>
  </span>
</button>

<style>
  .source-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 24px 16px;
    border-radius: 6px;
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.18);
    cursor: pointer;
    min-width: 150px;
    transition:
      background 0.1s,
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .source-card:hover {
    background: rgba(74, 90, 173, 0.15);
    border-color: rgba(74, 90, 173, 0.35);
    box-shadow: 0 0 12px rgba(74, 90, 173, 0.12);
  }

  .source-card:focus-visible {
    background: rgba(74, 90, 173, 0.15);
    border-color: rgba(74, 90, 173, 0.35);
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }

  .source-card.offline {
    opacity: 0.5;
  }

  .source-card.error {
    border-color: rgba(232, 90, 90, 0.3);
    background: rgba(232, 90, 90, 0.05);
  }

  .source-icon {
    width: 48px;
    height: 48px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .source-name {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    text-align: center;
    line-height: 1.3;
    margin-top: 2px;
  }

  .source-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-text {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
