<!--
  @component
  Scroll-triggered marketing section with eyebrow/title/subtitle pattern.
  Fades in and slides up when scrolled into view.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import type { Snippet } from "svelte";

  interface Props {
    eyebrow: string;
    title: string;
    subtitle?: string;
    eyebrowColor?: string;
    /** Optional HTML id for anchor links (e.g. id="how" for #how). */
    id?: string;
    children?: Snippet;
  }

  let { eyebrow, title, subtitle, eyebrowColor, id, children }: Props = $props();

  let sectionEl: HTMLElement | undefined = $state();
  let visible = $state(false);

  onMount(() => {
    if (!sectionEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible = true;
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(sectionEl);
    return () => observer.disconnect();
  });
</script>

<section class="section" {id} bind:this={sectionEl}>
  <div class="section-inner" class:visible>
    <div class="section-eyebrow" style={eyebrowColor ? `color:${eyebrowColor}` : undefined}>
      {eyebrow}
    </div>
    <h2 class="section-title">{title}</h2>
    {#if subtitle}
      <p class="section-sub">{subtitle}</p>
    {/if}
    {#if children}{@render children()}{/if}
  </div>
</section>

<style>
  .section {
    padding: 100px 32px;
  }

  .section-inner {
    max-width: 1100px;
    margin: 0 auto;
    opacity: 0;
    transform: translateY(24px);
    transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .section-inner.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .section-eyebrow {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gold);
    letter-spacing: 3px;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  .section-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 16px;
  }

  .section-sub {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 400;
    color: var(--color-text-dim);
    max-width: 560px;
    margin-bottom: 40px;
    line-height: 1.6;
  }

  @media (max-width: 600px) {
    .section {
      padding: 60px 20px;
    }
  }
</style>
