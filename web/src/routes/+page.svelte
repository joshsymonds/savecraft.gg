<!--
  @component
  Devices page: device cards, activity feed sidebar, inline install flow.
-->
<script lang="ts">
  import {
    ActivityEvent,
    ConfigModal,
    ConnectCard,
    InstallBlock,
    Panel,
    StatusDot,
    TinyButton,
  } from "$lib/components";
  import { activityEvents } from "$lib/stores/activity";
  import { devices } from "$lib/stores/devices";
  import { discoveryPending, startDiscovery } from "$lib/stores/discovery";
  import type { DeviceStatus } from "$lib/types/device";
  import type { Device } from "$lib/types/device";
  import { connectionStatus, type ConnectionStatus, send } from "$lib/ws/client";

  let configDeviceId = $state<string | null>(null);

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

  const ACCENT_COLORS: Record<DeviceStatus, string | undefined> = {
    online: "#5abe8a40",
    error: "#e8c44e40",
    offline: undefined,
  };

  const DEVICE_ICONS: Record<DeviceStatus, string> = {
    online: "*",
    error: "!",
    offline: "#",
  };

  const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
    connected: "LIVE",
    connecting: "CONNECTING",
    reconnecting: "RECONNECTING",
    disconnected: "OFFLINE",
  };

  const CONNECTION_STATUS: Record<ConnectionStatus, "online" | "error" | "offline"> = {
    connected: "online",
    connecting: "error",
    reconnecting: "offline",
    disconnected: "offline",
  };

  function gameIcon(name: string): string {
    return name.charAt(0).toUpperCase();
  }
</script>

<div class="devices-layout">
  <!-- Main: device cards -->
  <main class="devices">
    {#if $devices.length === 0}
      {#if $connectionStatus === "connecting"}
        <div class="empty-state">
          <span class="empty-text">Connecting...</span>
        </div>
      {:else}
        <InstallBlock prominent={true} />
      {/if}
    {:else}
      <ConnectCard />

      <div class="section-header">
        <span class="section-label">DEVICES</span>
        <span class="device-count">{$devices.length} connected</span>
      </div>

      {#each $devices as device (device.id)}
        <Panel accent={ACCENT_COLORS[device.status]}>
          <!-- Title bar -->
          <div class="device-title-bar">
            <div class="device-info">
              <span
                class="device-icon"
                class:online={device.status === "online"}
                class:error={device.status === "error"}
              >
                {DEVICE_ICONS[device.status]}</span
              >
              <div>
                <div class="device-name-row">
                  <span class="device-name">{device.name}</span>
                  <StatusDot status={device.status} size={7} />
                </div>
                <span class="device-meta">
                  {#if device.version}{device.version}{/if}
                  {#if device.status === "offline"}
                    {#if device.version}
                      ·
                    {/if}last seen {device.lastSeen}
                  {/if}
                </span>
              </div>
            </div>
            <div class="device-actions">
              <TinyButton
                label={$discoveryPending ? "SCANNING..." : "DISCOVER"}
                onclick={discover}
                disabled={device.status === "offline" || $discoveryPending}
              />
              <TinyButton
                label="RESCAN"
                onclick={() => {
                  rescan(device);
                }}
                disabled={device.status === "offline"}
              />
              <TinyButton label="CONFIG" onclick={() => (configDeviceId = device.id)} />
            </div>
          </div>

          <!-- Game grid -->
          <div class="game-grid">
            {#each device.games as game (game.gameId)}
              <div class="game-card" class:dimmed={game.status === "not_found"}>
                <span class="game-icon">{gameIcon(game.name)}</span>
                <span class="game-name">{game.name}</span>
                <span
                  class="game-status"
                  class:status-green={game.status === "watching"}
                  class:status-blue={game.status === "detected"}
                  class:status-yellow={game.status === "error"}
                  class:status-muted={game.status === "not_found"}
                >
                  {game.statusLine}
                </span>
                {#if game.status === "watching" && game.saves.length > 0}
                  <div class="save-list">
                    {#each game.saves as save (save.saveUuid)}
                      <span class="save-name">{save.saveName}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </Panel>
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
        class:connecting={$connectionStatus === "connecting"}
        class:offline={$connectionStatus === "disconnected" || $connectionStatus === "reconnecting"}
      >
        <StatusDot status={CONNECTION_STATUS[$connectionStatus]} size={5} />
        {CONNECTION_LABEL[$connectionStatus]}
      </span>
    </div>
    <div class="activity-feed">
      {#each $activityEvents as activityEvent, index (activityEvent.id)}
        <ActivityEvent
          type={activityEvent.type}
          message={activityEvent.message}
          detail={activityEvent.detail}
          time={activityEvent.time}
          isNew={index === 0}
        />
      {/each}
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
  }

  .device-title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
    min-height: 52px;
  }

  .device-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .device-icon {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .device-icon.online {
    color: var(--color-green);
  }

  .device-icon.error {
    color: var(--color-yellow);
  }

  .device-name-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .device-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .device-meta {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
  }

  .device-actions {
    display: flex;
    gap: 5px;
  }

  .game-grid {
    padding: 14px 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .game-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 10px;
    border-radius: 4px;
    background: rgba(74, 90, 173, 0.03);
    border: 1px solid rgba(74, 90, 173, 0.06);
    min-width: 110px;
  }

  .game-card.dimmed {
    opacity: 0.3;
  }

  .game-icon {
    font-family: var(--font-pixel);
    font-size: 18px;
    margin-bottom: 6px;
    color: var(--color-gold-light);
  }

  .game-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text-dim);
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .game-status {
    font-family: var(--font-body);
    font-size: 15px;
  }

  .status-green {
    color: var(--color-green);
  }

  .status-blue {
    color: var(--color-blue);
  }

  .status-yellow {
    color: var(--color-yellow);
  }

  .status-muted {
    color: var(--color-text-muted);
  }

  .save-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    margin-top: 4px;
  }

  .save-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
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

  .live-indicator.connecting {
    color: var(--color-yellow);
  }

  .live-indicator.offline {
    color: var(--color-text-muted);
  }

  .activity-feed {
    flex: 1;
    overflow-y: auto;
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
