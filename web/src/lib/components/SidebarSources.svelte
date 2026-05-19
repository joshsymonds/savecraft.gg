<!--
  @component
  Compact paired-computers status block at the top of the activity
  sidebar. Display-only after the game-centric IA (Req 17): each row
  shows the machine's platform/device icon, name, and connection
  status; clicking opens SourceDetailModal. Adding/configuring a
  computer happens through a game, not here.
-->
<script lang="ts">
  import type { Source } from "$lib/types/source";

  import { getSourceIconUrl } from "./source-icon";
  import StatusDot from "./StatusDot.svelte";

  let {
    sources,
    oncardclick,
  }: {
    sources: Source[];
    oncardclick?: (source: Source) => void;
  } = $props();

  function statusLabel(source: Source): string {
    if (source.status === "online") return "Online";
    if (source.status === "error") return "Error";
    if (source.status === "linked")
      return source.lastSeen ? `Linked · ${source.lastSeen}` : "Linked";
    return source.lastSeen || "Offline";
  }
</script>

<div class="sidebar-sources">
  <span class="computers-label">COMPUTERS</span>
  <div class="computer-list">
    {#each sources as source (source.id)}
      <button
        class="computer-row"
        class:offline={source.status === "offline"}
        class:error={source.status === "error"}
        onclick={() => oncardclick?.(source)}
      >
        <img
          class="computer-icon"
          src={getSourceIconUrl(source)}
          alt={(source.hostname ?? source.name).toUpperCase()}
          width="40"
          height="40"
        />
        <div class="computer-info">
          <span class="computer-name">{(source.hostname ?? source.name).toUpperCase()}</span>
          <span class="computer-status">
            <StatusDot status={source.status} size={6} />
            <span class="status-text">{statusLabel(source)}</span>
          </span>
        </div>
        <span class="computer-chevron" aria-hidden="true">&rsaquo;</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .sidebar-sources {
    padding: 16px 16px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
  }

  .computers-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
    margin-bottom: 12px;
  }

  .computer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .computer-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.18);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.12s,
      border-color 0.15s;
  }

  .computer-row:hover {
    background: rgba(74, 90, 173, 0.15);
    border-color: rgba(74, 90, 173, 0.35);
  }

  .computer-row:focus-visible {
    outline: 2px solid var(--color-blue);
    outline-offset: -1px;
  }

  .computer-row.offline {
    opacity: 0.55;
  }

  .computer-row.error {
    border-color: rgba(232, 90, 90, 0.3);
    background: rgba(232, 90, 90, 0.05);
  }

  .computer-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    image-rendering: pixelated;
    flex-shrink: 0;
  }

  .computer-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }

  .computer-chevron {
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 22px;
    line-height: 1;
    color: var(--color-text-muted);
    transition:
      color 0.12s,
      transform 0.12s;
  }

  .computer-row:hover .computer-chevron {
    color: var(--color-text);
    transform: translateX(2px);
  }

  .computer-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .computer-status {
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
