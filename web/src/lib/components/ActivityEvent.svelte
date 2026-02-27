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
    parse_success: { icon: "✓", colorVar: "var(--color-green)" },
    parse_error: { icon: "⚠", colorVar: "var(--color-yellow)" },
    watching: { icon: "→", colorVar: "var(--color-blue)" },
    game_detected: { icon: "◈", colorVar: "var(--color-green)" },
    daemon_online: { icon: "▶", colorVar: "var(--color-green)" },
    daemon_offline: { icon: "■", colorVar: "var(--color-red)" },
    plugin_updated: { icon: "↑", colorVar: "var(--color-gold)" },
    config_push: { icon: "⟳", colorVar: "var(--color-blue)" },
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
    gap: 8px;
    padding: 7px 14px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    align-items: flex-start;
  }

  .event.is-new {
    animation: fade-slide-in 0.35s ease-out;
  }

  .icon {
    font-family: var(--font-pixel);
    font-size: 8px;
    min-width: 14px;
    text-align: center;
    padding-top: 3px;
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
