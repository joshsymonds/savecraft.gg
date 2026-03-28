<!--
  @component
  Gaming-styled decorative separator with optional center decoration.
  Lines animate outward from the center diamond/cross on entrance,
  with a subtle persistent glow along the edges.
-->
<script lang="ts">
  interface Props {
    /** Direction (default: "horizontal") */
    direction?: "horizontal" | "vertical";
    /** Center decoration (default: "diamond") */
    decoration?: "diamond" | "cross" | "none";
  }

  let { direction = "horizontal", decoration = "diamond" }: Props = $props();

  const symbols = { diamond: "◆", cross: "✦", none: "" };
</script>

<div class="divider" class:vertical={direction === "vertical"}>
  <span class="line line-before"></span>
  {#if decoration !== "none"}
    <span class="decoration">{symbols[decoration]}</span>
  {/if}
  <span class="line line-after"></span>
</div>

<style>
  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
  }

  .line {
    flex: 1;
    height: 1px;
    position: relative;
  }

  /* Main gradient line */
  .line-before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 10%,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 100%
    );
    animation: line-grow-left 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
    transform-origin: right center;
  }

  .line-after {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 90%,
      transparent 100%
    );
    animation: line-grow-right 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
    transform-origin: left center;
  }

  /* Persistent edge glow */
  .line::after {
    content: "";
    position: absolute;
    inset: -3px 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 25%,
      color-mix(in srgb, var(--color-gold) 12%, transparent) 50%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 75%,
      transparent 100%
    );
    filter: blur(1px);
    animation: glow-pulse 4s ease-in-out infinite;
  }

  .decoration {
    font-size: 8px;
    color: var(--color-gold);
    opacity: 0.6;
    flex-shrink: 0;
    line-height: 1;
    animation: deco-appear 0.3s ease-out both;
  }

  /* ── Vertical variant ── */
  .vertical {
    flex-direction: column;
    padding: 0 var(--space-sm);
    align-self: stretch;
  }

  .vertical .line {
    width: 1px;
    height: auto;
    flex: 1;
  }

  .vertical .line-before {
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 10%,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 100%
    );
    animation-name: line-grow-up;
    transform-origin: center bottom;
  }

  .vertical .line-after {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 90%,
      transparent 100%
    );
    animation-name: line-grow-down;
    transform-origin: center top;
  }

  .vertical .line::after {
    inset: 0 -3px;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 25%,
      color-mix(in srgb, var(--color-gold) 12%, transparent) 50%,
      color-mix(in srgb, var(--color-gold) 8%, transparent) 75%,
      transparent 100%
    );
    filter: blur(1px);
  }

  /* ── Animations ── */
  @keyframes line-grow-left {
    from { transform: scaleX(0); opacity: 0; }
    to { transform: scaleX(1); opacity: 1; }
  }

  @keyframes line-grow-right {
    from { transform: scaleX(0); opacity: 0; }
    to { transform: scaleX(1); opacity: 1; }
  }

  @keyframes line-grow-up {
    from { transform: scaleY(0); opacity: 0; }
    to { transform: scaleY(1); opacity: 1; }
  }

  @keyframes line-grow-down {
    from { transform: scaleY(0); opacity: 0; }
    to { transform: scaleY(1); opacity: 1; }
  }

  @keyframes deco-appear {
    from { opacity: 0; transform: scale(0); }
    to { opacity: 0.6; transform: scale(1); }
  }

  @keyframes glow-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
