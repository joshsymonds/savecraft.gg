<!--
  @component
  Devices page: device cards, activity feed sidebar, inline install flow.
-->
<script lang="ts">
  import { createNote, deleteNote, fetchNotes, toNoteSummary, updateNote } from "$lib/api/client";
  import {
    ActivityEvent,
    ConfigModal,
    ConnectCard,
    DeviceWindow,
    InstallBlock,
    LinkingCard,
    StatusDot,
  } from "$lib/components";
  import { activateGame } from "$lib/stores/activation";
  import { activityEvents } from "$lib/stores/activity";
  import { devices, setGameStatus } from "$lib/stores/devices";
  import { discoveryPending, startDiscovery } from "$lib/stores/discovery";
  import { pendingLinkCode } from "$lib/stores/link-code";
  import {
    dismissLinkError,
    linkedDeviceId,
    linkError,
    linkState,
    submitLinkCode,
  } from "$lib/stores/link-flow";
  import type { Device, DeviceStatus } from "$lib/types/device";
  import { connectionStatus, type ConnectionStatus, send } from "$lib/ws/client";

  const COLLAPSED_EVENT_COUNT = 8;

  let configDeviceId = $state<string | null>(null);
  let activityExpanded = $state(false);
  let showLinkInput = $state(false);
  let displayCode = $state("");

  // Auto-submit pending link code from /link/[code] redirect
  $effect(() => {
    const code = $pendingLinkCode;
    if (code) {
      displayCode = code;
      void submitLinkCode(code);
    }
  });

  function handleManualLink(code: string): void {
    displayCode = code;
    showLinkInput = false;
    void submitLinkCode(code);
  }

  let visibleEvents = $derived(
    activityExpanded ? $activityEvents : $activityEvents.slice(0, COLLAPSED_EVENT_COUNT),
  );
  let hiddenCount = $derived($activityEvents.length - COLLAPSED_EVENT_COUNT);

  function rescan(device: Device): void {
    for (const game of device.games) {
      if (game.status !== "not_found") {
        send(JSON.stringify({ rescanGame: { gameId: game.gameId } }));
      }
    }
  }

  function discover(): void {
    startDiscovery();
    send(JSON.stringify({ discoverGames: {} }));
  }

  async function handleActivate(deviceId: string, gameId: string): Promise<void> {
    try {
      await activateGame(deviceId, gameId);
      setGameStatus(deviceId, gameId, "activating");
    } catch {
      // DeviceWindow handles its own activate states internally
    }
  }

  const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
    connected: "LIVE",
    connecting: "CONNECTING",
    reconnecting: "RECONNECTING",
    disconnected: "OFFLINE",
  };

  const CONNECTION_STATUS: Record<ConnectionStatus, DeviceStatus> = {
    connected: "online",
    connecting: "offline",
    reconnecting: "offline",
    disconnected: "offline",
  };
</script>

<svelte:head>
  <title>Devices — Savecraft</title>
</svelte:head>

<div class="devices-layout">
  <!-- Main: device cards -->
  <main class="devices">
    {#if $linkState === "linking"}
      <LinkingCard cardState="linking" code={displayCode} />
    {:else if $linkState === "error"}
      <LinkingCard cardState="error" errorMessage={$linkError} ondismiss={dismissLinkError} />
    {:else if showLinkInput}
      <LinkingCard cardState="input" onsubmit={handleManualLink} ondismiss={() => (showLinkInput = false)} />
    {/if}

    {#if $devices.length === 0}
      {#if $connectionStatus === "connecting"}
        <div class="empty-state">
          <span class="empty-text">Connecting...</span>
        </div>
      {:else if $linkState !== "linking"}
        <InstallBlock prominent={true} />
      {/if}
    {:else}
      <ConnectCard />

      <div class="section-header">
        <span class="section-label">DEVICES</span>
        <span class="device-count">{$devices.length} connected</span>
        {#if $linkState === "idle" && !showLinkInput}
          <button class="add-device-btn" onclick={() => (showLinkInput = true)}>+ ADD DEVICE</button>
        {/if}
      </div>

      {#each $devices as device (device.id)}
        <DeviceWindow
          {device}
          justLinked={device.id === $linkedDeviceId}
          onrescan={() => rescan(device)}
          ondiscover={discover}
          onconfig={() => (configDeviceId = device.id)}
          onactivate={(gameId: string) => void handleActivate(device.id, gameId)}
          discoveryPending={$discoveryPending}
          loadNotes={async (saveUuid) => {
            const notes = await fetchNotes(saveUuid);
            return notes.map((n) => toNoteSummary(n));
          }}
          onnotecreate={async (saveUuid, title, content) => {
            await createNote(saveUuid, title, content);
          }}
          onnotedelete={async (saveUuid, noteId) => {
            await deleteNote(saveUuid, noteId);
          }}
          onnoteedit={async (saveUuid, noteId, title, content) => {
            await updateNote(saveUuid, noteId, { title, content });
          }}
        />
      {/each}

      <InstallBlock prominent={false} />
    {/if}
  </main>

  <!-- Sidebar: activity feed -->
  <aside class="activity-sidebar">
    <div class="activity-header">
      <span class="activity-label">ACTIVITY</span>
      <span
        class="live-indicator"
        class:live={$connectionStatus === "connected"}
        class:offline={$connectionStatus !== "connected"}
      >
        <StatusDot status={CONNECTION_STATUS[$connectionStatus]} size={5} />
        {CONNECTION_LABEL[$connectionStatus]}
      </span>
    </div>
    <div class="activity-feed">
      {#each visibleEvents as activityEvent, index (activityEvent.id)}
        <ActivityEvent
          type={activityEvent.type}
          message={activityEvent.message}
          detail={activityEvent.detail}
          time={activityEvent.time}
          isNew={index === 0}
        />
      {/each}
      {#if !activityExpanded && hiddenCount > 0}
        <button class="show-more" onclick={() => (activityExpanded = true)}>
          Show {hiddenCount} more
        </button>
      {:else if activityExpanded && $activityEvents.length > COLLAPSED_EVENT_COUNT}
        <button class="show-more" onclick={() => (activityExpanded = false)}> Show less </button>
      {/if}
      {#if $activityEvents.length === 0}
        <div class="empty-feed">
          <span class="empty-feed-text">No activity yet</span>
        </div>
      {/if}
    </div>
  </aside>
</div>

{#if configDeviceId}
  <ConfigModal deviceId={configDeviceId} onclose={() => (configDeviceId = null)} />
{/if}

<style>
  .devices-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    height: 100%;
  }

  /* -- Devices area ----------------------------------------- */

  .devices {
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }

  .section-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .device-count {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    flex: 1;
  }

  .add-device-btn {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1px;
    background: none;
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .add-device-btn:hover {
    background: rgba(200, 168, 78, 0.1);
    border-color: var(--color-gold);
  }

  .empty-state {
    padding: 48px 24px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* -- Activity sidebar ------------------------------------- */

  .activity-sidebar {
    border-left: 1px solid rgba(74, 90, 173, 0.12);
    background: rgba(5, 7, 26, 0.3);
    display: flex;
    flex-direction: column;
  }

  .activity-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .activity-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .live-indicator {
    font-family: var(--font-pixel);
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .live-indicator.live {
    color: var(--color-green);
  }

  .live-indicator.offline {
    color: var(--color-text-muted);
  }

  .activity-feed {
    flex: 1;
    overflow-y: auto;
  }

  .show-more {
    display: block;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    border-top: 1px solid rgba(74, 90, 173, 0.08);
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
    cursor: pointer;
    text-align: center;
    transition: color 0.15s;
  }

  .show-more:hover {
    color: var(--color-text);
  }

  .empty-feed {
    padding: 24px 18px;
    text-align: center;
  }

  .empty-feed-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }
</style>
