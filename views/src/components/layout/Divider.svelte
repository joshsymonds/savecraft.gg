<!--
  @component
  Gaming-styled decorative separator with optional center decoration.
  Gradient line matching Section title bar aesthetic.
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
  }

  .line-before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 10%,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 100%
    );
  }

  .line-after {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 90%,
      transparent 100%
    );
  }

  .decoration {
    font-size: 8px;
    color: var(--color-gold);
    opacity: 0.6;
    flex-shrink: 0;
    line-height: 1;
  }

  /* Vertical variant */
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
  }

  .vertical .line-after {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 0%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 90%,
      transparent 100%
    );
  }
</style>
