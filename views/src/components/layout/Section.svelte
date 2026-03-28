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
    /** Slot content */
    children?: Snippet;
  }

  let { title, count, subtitle, children }: Props = $props();
</script>

<section class="section">
  <header class="header">
    <div class="title-row">
      <h3 class="title">{title}</h3>
      {#if count !== undefined}
        <span class="count">{count.toLocaleString()}</span>
      {/if}
    </div>
    {#if subtitle}
      <p class="subtitle">{subtitle}</p>
    {/if}
  </header>
  <div class="divider"></div>
  <div class="content">
    {@render children?.()}
  </div>
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    animation: section-enter 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    padding: var(--space-sm) var(--space-md);
    margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-lg)) 0;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
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
    color: var(--color-gold);
    text-transform: uppercase;
    letter-spacing: 2px;
    flex: 1;
  }

  .count {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-gold-light);
    background: color-mix(in srgb, var(--color-gold) 15%, transparent);
    padding: 1px 10px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 30%, transparent);
    line-height: 1.4;
  }

  .subtitle {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-dim);
  }

  .divider {
    height: 1px;
    margin: 0 calc(-1 * var(--space-lg));
    background: linear-gradient(
      90deg,
      var(--color-gold) 0%,
      color-mix(in srgb, var(--color-gold) 50%, transparent) 50%,
      color-mix(in srgb, var(--color-gold) 20%, transparent) 90%,
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
