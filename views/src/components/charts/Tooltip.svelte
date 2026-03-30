<!--
  @component
  Floating tooltip positioned near a hover target.
  Used by chart components to show values on hover.
-->
<script lang="ts">
  interface Props {
    /** Tooltip text */
    text: string;
    /** X position in px */
    x: number;
    /** Y position in px */
    y: number;
    /** Whether the tooltip is visible */
    visible: boolean;
  }

  let { text, x, y, visible }: Props = $props();
</script>

{#if visible}
  <div class="tooltip" style:left="{x}px" style:top="{y}px">
    {text}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 3px 8px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    animation: tooltip-in 0.15s ease-out;
    transform: translate(-50%, -100%) translateY(-8px);
  }

  @keyframes tooltip-in {
    from { opacity: 0; transform: translate(-50%, -100%) translateY(-4px); }
    to { opacity: 1; transform: translate(-50%, -100%) translateY(-8px); }
  }
</style>
