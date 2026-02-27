<!--
  @component
  Dashboard: device cards + activity feed sidebar.
-->
<script lang="ts">
  import { ActivityEvent, Panel, StatusDot, TinyButton } from "$lib/components";
  import { activityEvents } from "$lib/stores/activity";
  import { devices } from "$lib/stores/devices";
  import type { DeviceStatus } from "$lib/types/device";

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
</script>

<div class="dashboard">
  <!-- ── Main: device cards ──────────────────────────────── -->
  <main class="devices">
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
                {device.os} · {device.version}
                {#if device.status === "offline"}
                  · last seen {device.lastSeen}{/if}
              </span>
            </div>
          </div>
          <div class="device-actions">
            <TinyButton label="RESCAN" />
            <TinyButton label="CONFIG" />
          </div>
        </div>

        <!-- Game grid -->
        <div class="game-grid">
          {#each device.games as game (game.gameId)}
            <div class="game-card" class:dimmed={game.status === "not_found"}>
              <span class="game-icon">{game.icon}</span>
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
            </div>
          {/each}
        </div>
      </Panel>
    {/each}
  </main>

  <!-- ── Sidebar: activity feed ──────────────────────────── -->
  <aside class="activity-sidebar">
    <div class="activity-header">
      <span class="activity-label">ACTIVITY</span>
      <span class="live-indicator">
        <StatusDot status="online" size={5} /> LIVE
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
    </div>
  </aside>
</div>

<style>
  .dashboard {
    display: grid;
    grid-template-columns: 1fr 380px;
    min-height: 100vh;
  }

  /* ── Devices area ─────────────────────────────────────── */

  .devices {
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 8px;
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
    font-size: 9px;
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
    font-size: 6px;
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

  /* ── Activity sidebar ─────────────────────────────────── */

  .activity-sidebar {
    border-left: 1px solid rgba(74, 90, 173, 0.12);
    background: rgba(5, 7, 26, 0.3);
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: sticky;
    top: 0;
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
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .live-indicator {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-green);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .activity-feed {
    flex: 1;
    overflow-y: auto;
  }
</style>
