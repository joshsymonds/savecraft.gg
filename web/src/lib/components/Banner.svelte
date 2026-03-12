<!--
  @component
  Reusable banner for inline notices inside modals or sections.
  Supports customizable colors, optional dot indicator, and optional children for rich content.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    color = "var(--color-yellow, #e8b45a)",
    background,
    borderColor,
    dot = false,
    children,
  }: {
    /** Primary color for text and dot. Defaults to yellow. */
    color?: string;
    /** Background color. Defaults to a subtle tint of `color`. */
    background?: string;
    /** Bottom border color. Defaults to a subtle tint of `color`. */
    borderColor?: string;
    /** Show a colored dot indicator before the text. */
    dot?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  class="banner"
  role="status"
  style:--banner-color={color}
  style:--banner-bg={background ?? "color-mix(in srgb, var(--banner-color) 8%, transparent)"}
  style:--banner-border={borderColor ?? "color-mix(in srgb, var(--banner-color) 15%, transparent)"}
>
  {#if dot}
    <span class="banner-dot"></span>
  {/if}
  <span class="banner-content">
    {@render children()}
  </span>
</div>

<style>
  .banner {
    padding: 10px 18px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--banner-color);
    background: var(--banner-bg);
    border-bottom: 1px solid var(--banner-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .banner-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--banner-color);
    flex-shrink: 0;
  }

  .banner-content {
    flex: 1;
    min-width: 0;
  }
</style>
