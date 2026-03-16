<!--
  @component
  Animated status indicator dot.
  Shows online (green + pulse), error (yellow), or offline (muted).
-->
<script lang="ts">
  type Status = "online" | "error" | "offline" | "linked";

  interface Props {
    status: Status;
    /** Dot diameter in pixels */
    size?: number;
  }

  let { status, size = 8 }: Props = $props();

  const colorMap: Record<Status, string> = {
    online: "var(--color-green)",
    linked: "var(--color-blue)",
    error: "var(--color-yellow)",
    offline: "var(--color-text-muted)",
  };

  let color = $derived(colorMap[status]);
</script>

<span class="status-dot" style:--dot-size="{size}px" style:--dot-color={color}>
  <span class="dot" class:glow={status === "online"}></span>
  {#if status === "online"}
    <span class="pulse"></span>
  {/if}
</span>

<style>
  .status-dot {
    position: relative;
    display: inline-block;
    width: var(--dot-size);
    height: var(--dot-size);
  }

  .dot {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--dot-color);
  }

  .dot.glow {
    box-shadow: 0 0 8px color-mix(in srgb, var(--dot-color) 53%, transparent);
  }

  .pulse {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--dot-color) 27%, transparent);
    animation: ping-pulse 2s ease-out infinite;
  }
</style>
