<!--
  @component
  Vertical timeline with connected events.
  Used for draft pick-by-pick review, session history, game progression.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted";

  interface TimelineEvent {
    label: string;
    sublabel?: string;
    value?: string | number;
    variant?: Variant;
    marker?: string;
  }

  interface Props {
    /** Ordered events */
    events: TimelineEvent[];
  }

  let { events }: Props = $props();

  const variantColors: Record<Variant, string> = {
    positive: "var(--color-positive)",
    negative: "var(--color-negative)",
    highlight: "var(--color-highlight)",
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    muted: "var(--color-text-muted)",
  };
</script>

<div class="timeline">
  {#if events.length > 1}
    <div class="timeline-line"></div>
  {/if}
  {#each events as event, i}
    <div class="timeline-event" style:animation-delay="{i * 60}ms">
      <div class="dot-col">
        <span
          class="dot"
          style:background={event.variant ? variantColors[event.variant] : "var(--color-border-light)"}
        >{event.marker ?? ""}</span>
      </div>
      <div class="event-content">
        <span class="event-label">{event.label}</span>
        {#if event.sublabel}
          <span class="event-sublabel">{event.sublabel}</span>
        {/if}
      </div>
      {#if event.value !== undefined}
        <span
          class="event-value"
          style:color={event.variant ? variantColors[event.variant] : undefined}
        >{event.value}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .timeline {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .timeline-line {
    position: absolute;
    left: 11px;
    top: 12px;
    bottom: 12px;
    width: 2px;
    background: linear-gradient(
      180deg,
      var(--color-border-light) 0%,
      color-mix(in srgb, var(--color-border) 40%, transparent) 100%
    );
    border-radius: 1px;
  }

  .timeline-event {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    animation: event-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .timeline-event:nth-child(even of .timeline-event) {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .dot-col {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--color-bg) 30%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 6px;
    z-index: 1;
  }

  .event-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .event-label {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .event-sublabel {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .event-value {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text);
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }

  @keyframes event-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
