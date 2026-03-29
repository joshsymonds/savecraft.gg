<!--
  @component
  Titled content block with window-bar header.
  The standard way to label and group content in Savecraft views.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Section title (rendered uppercase in pixel font) */
    title: string;
    /** Optional count badge next to title */
    count?: number;
    /** Optional subtitle below title */
    subtitle?: string;
    /** Accent color for title text, divider, and count pill (defaults to --color-gold) */
    accent?: string;
    /** Header background tint color (defaults to accent; use a bright color for visibility against dark panels) */
    headerTint?: string;
    /** Full header background override (e.g. a gradient); replaces the default decay gradient */
    headerBg?: string;
    /** Title text color override (defaults to accent; use when accent is too dark to read) */
    titleColor?: string;
    /** Optional icons rendered in the upper-right of the header */
    icons?: Snippet;
    /** Optional badge rendered below the icons on the right */
    badge?: Snippet;
    /** Optional custom divider replacing the default gold gradient line */
    divider?: Snippet;
    /** Slot content */
    children?: Snippet;
  }

  let { title, count, subtitle, accent, headerTint, headerBg, titleColor, icons, badge, divider, children }: Props = $props();
</script>

<section class="section">
  <header
    class="header"
    style:--section-accent={accent ?? undefined}
    style:--section-tint={headerTint ?? undefined}
    style:--section-header-bg={headerBg ?? undefined}
    style:--section-title-color={titleColor ?? undefined}
  >
    <div class="header-left">
      <div class="title-row">
        <h3 class="title">{title}</h3>
        {#if count !== undefined}
          <span class="count">{count.toLocaleString()}</span>
        {/if}
      </div>
      {#if subtitle}
        <p class="subtitle">{subtitle}</p>
      {/if}
    </div>
    {#if icons || badge}
      <div class="header-right">
        {#if icons}
          <div class="icons">{@render icons()}</div>
        {/if}
        {#if badge}
          <div class="badge-slot">{@render badge()}</div>
        {/if}
      </div>
    {/if}
  </header>
  {#if divider}
    <div class="divider-slot">{@render divider()}</div>
  {:else}
    <div class="divider"></div>
  {/if}
  <div class="content">
    {@render children?.()}
  </div>
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    --section-accent: var(--color-gold);
    --section-tint: var(--section-accent);
    --section-title-color: var(--section-accent);
    animation: section-enter 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    background: var(--section-header-bg,
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--section-tint) 30%, transparent) 0%,
        color-mix(in srgb, var(--section-tint) 20%, transparent) 30%,
        color-mix(in srgb, var(--section-tint) 8%, transparent) 60%,
        transparent 100%
      )
    );
    padding: var(--space-sm) var(--space-md);
    margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-lg)) 0;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
    flex: 1;
  }

  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  .icons {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .badge-slot {
    display: flex;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .title {
    font-family: var(--font-pixel);
    font-size: 11px;
    font-weight: 400;
    color: var(--section-title-color);
    text-transform: uppercase;
    letter-spacing: 2px;
    flex: 1;
    min-width: 0;
  }

  .count {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-gold-light);
    background: color-mix(in srgb, var(--section-accent) 15%, transparent);
    padding: 1px 10px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--section-accent) 30%, transparent);
    line-height: 1.4;
  }

  .subtitle {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-dim);
  }

  .divider-slot {
    margin: 0 calc(-1 * var(--space-lg));
  }

  .divider {
    height: 1px;
    margin: 0 calc(-1 * var(--space-lg));
    background: linear-gradient(
      90deg,
      var(--section-accent) 0%,
      color-mix(in srgb, var(--section-accent) 50%, transparent) 50%,
      color-mix(in srgb, var(--section-accent) 20%, transparent) 90%,
      transparent 100%
    );
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding-top: var(--space-md);
  }

  @keyframes section-enter {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
