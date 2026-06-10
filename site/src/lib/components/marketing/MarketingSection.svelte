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
    /**
     * Section background treatment.
     * - plain: type on the page background (default)
     * - tinted: soft navy band
     * - bleed: full-width spotlight with gold-tinged glow, for the one
     *   section per page that deserves emphasis
     */
    treatment?: "plain" | "tinted" | "bleed";
    children?: Snippet;
  }

  let {
    eyebrow,
    title,
    subtitle,
    eyebrowColor,
    id,
    treatment = "plain",
    children,
  }: Props = $props();

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

<section
  class="section"
  class:treatment-plain={treatment === "plain"}
  class:treatment-tinted={treatment === "tinted"}
  class:treatment-bleed={treatment === "bleed"}
  {id}
  bind:this={sectionEl}
>
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

  /* Display-scale Chakra Petch titles; pixel font stays reserved
     for hero h1 and the final CTA at the page level. */
  .section-title {
    font-family: var(--font-heading);
    font-size: var(--text-display);
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: 0.5px;
    line-height: 1.15;
    margin-bottom: 18px;
  }

  .section-sub {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    max-width: 720px;
    margin-bottom: 40px;
    line-height: 1.6;
  }

  .treatment-tinted {
    background: var(--color-surface-tint);
    border-top: 1px solid var(--color-border-soft);
    border-bottom: 1px solid var(--color-border-soft);
  }

  .treatment-bleed {
    padding: 130px 32px;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(200, 168, 78, 0.08) 0%, transparent 55%),
      linear-gradient(180deg, #0a0e2e 0%, #060a22 100%);
    border-top: 1px solid var(--color-gold-soft);
    border-bottom: 1px solid var(--color-gold-soft);
  }

  @media (max-width: 600px) {
    .section {
      padding: 60px 20px;
    }

    .treatment-bleed {
      padding: 80px 20px;
    }
  }
</style>
