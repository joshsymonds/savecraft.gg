<!--
  @component
  Single entry in the activity feed sidebar.
-->
<script lang="ts">
  import type { ActivityEventType } from "$lib/types/activity";

  interface Props {
    type: ActivityEventType;
    message: string;
    detail?: string;
    time: string;
    isNew?: boolean;
  }

  let { type, message, detail, time, isNew = false }: Props = $props();

  const iconMap: Record<ActivityEventType, { icon: string; colorVar: string }> = {
    parse_started: { icon: "○", colorVar: "var(--color-blue)" },
    plugin_status: { icon: "›", colorVar: "var(--color-text-dim)" },
    parse_completed: { icon: "✓", colorVar: "var(--color-green)" },
    parse_failed: { icon: "✕", colorVar: "var(--color-red)" },
    push_started: { icon: "↑", colorVar: "var(--color-blue)" },
    push_completed: { icon: "✓", colorVar: "var(--color-green)" },
    push_failed: { icon: "✕", colorVar: "var(--color-red)" },
    plugin_updated: { icon: "↑", colorVar: "var(--color-gold)" },
    daemon_online: { icon: "▶", colorVar: "var(--color-green)" },
    daemon_offline: { icon: "■", colorVar: "var(--color-red)" },
    watching: { icon: "→", colorVar: "var(--color-blue)" },
    game_detected: { icon: "◆", colorVar: "var(--color-green)" },
    game_not_found: { icon: "◇", colorVar: "var(--color-text-muted)" },
    scan_started: { icon: "○", colorVar: "var(--color-blue)" },
    scan_completed: { icon: "●", colorVar: "var(--color-green)" },
    games_discovered: { icon: "◆", colorVar: "var(--color-gold)" },
    plugin_download_failed: { icon: "✕", colorVar: "var(--color-red)" },
  };

  let config = $derived(iconMap[type]);
</script>

<div class="event" class:is-new={isNew}>
  <span class="icon" style:color={config.colorVar}>{config.icon}</span>
  <div class="content">
    <div class="message">{message}</div>
    {#if detail}
      <div class="detail">{detail}</div>
    {/if}
  </div>
  <span class="time">{time}</span>
</div>

<style>
  .event {
    display: flex;
    gap: 6px;
    padding: 7px 14px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    align-items: flex-start;
  }

  .event.is-new {
    animation: fade-slide-in 0.35s ease-out;
  }

  .icon {
    font-family: var(--font-body);
    font-size: 20px;
    min-width: 20px;
    text-align: center;
    line-height: 1.1;
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  .message {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin-top: 1px;
  }

  .time {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    white-space: nowrap;
    padding-top: 2px;
  }
</style>
