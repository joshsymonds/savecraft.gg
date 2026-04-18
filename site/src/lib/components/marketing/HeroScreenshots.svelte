<!--
  @component
  Marketing hero showcase of real product screenshots. Three visual variants:
  stacked (top-to-bottom), overlap (offset cards with depth), and carousel
  (single visible frame with indicator dots). Selected via the `variant` prop
  so all three render via a single component — the page picks one.
-->
<script lang="ts">
  import { onMount } from "svelte";

  interface Frame {
    src: string;
    alt: string;
    caption?: string;
  }

  interface Props {
    frames: Frame[];
    variant?: "stacked" | "overlap" | "carousel";
    accent?: "gold" | "crimson" | "blue" | "green";
    title?: string;
    eyebrow?: string;
    /** Carousel only. Milliseconds between auto-advance. 0 disables. */
    autoAdvanceMs?: number;
  }

  let {
    frames,
    variant = "stacked",
    accent = "gold",
    title,
    eyebrow,
    autoAdvanceMs = 6000,
  }: Props = $props();

  let carouselIndex = $state(0);
  let autoTimer: ReturnType<typeof setTimeout> | undefined;

  function goTo(i: number) {
    carouselIndex = i;
    resetAutoAdvance();
  }

  function resetAutoAdvance() {
    if (autoTimer) clearTimeout(autoTimer);
    if (variant === "carousel" && autoAdvanceMs > 0 && frames.length > 1) {
      autoTimer = setTimeout(() => {
        carouselIndex = (carouselIndex + 1) % frames.length;
        resetAutoAdvance();
      }, autoAdvanceMs);
    }
  }

  onMount(() => {
    resetAutoAdvance();
    return () => {
      if (autoTimer) clearTimeout(autoTimer);
    };
  });
</script>

<div class="hero-screenshots variant-{variant} accent-{accent}">
  {#if eyebrow || title}
    <div class="hero-text">
      {#if eyebrow}<div class="hero-eyebrow">{eyebrow}</div>{/if}
      {#if title}<h1 class="hero-title">{title}</h1>{/if}
    </div>
  {/if}

  {#if variant === "stacked"}
    <div class="stacked-frames">
      {#each frames as frame, i (frame.src)}
        <figure class="frame frame-{i}">
          <img src={frame.src} alt={frame.alt} loading={i === 0 ? "eager" : "lazy"} />
          {#if frame.caption}
            <figcaption class="caption">{frame.caption}</figcaption>
          {/if}
        </figure>
      {/each}
    </div>
  {:else if variant === "overlap"}
    <div class="overlap-stage">
      {#each frames.slice(0, 2) as frame, i (frame.src)}
        <figure class="frame overlap-frame overlap-frame-{i}">
          <img src={frame.src} alt={frame.alt} loading={i === 0 ? "eager" : "lazy"} />
          {#if frame.caption}
            <figcaption class="caption">{frame.caption}</figcaption>
          {/if}
        </figure>
      {/each}
    </div>
  {:else if variant === "carousel"}
    <div class="carousel">
      <div class="carousel-viewport">
        {#each frames as frame, i (frame.src)}
          <figure
            class="frame carousel-frame"
            class:active={i === carouselIndex}
            aria-hidden={i !== carouselIndex}
          >
            <img src={frame.src} alt={frame.alt} loading={i === 0 ? "eager" : "lazy"} />
            {#if frame.caption}
              <figcaption class="caption">{frame.caption}</figcaption>
            {/if}
          </figure>
        {/each}
      </div>
      {#if frames.length > 1}
        <div class="carousel-dots">
          {#each frames as frame, i (frame.src)}
            <button
              type="button"
              class="dot"
              class:active={i === carouselIndex}
              aria-label={`Show screenshot ${i + 1}: ${frame.alt}`}
              onclick={() => goTo(i)}
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Accent color mapping — frame border + glow per theme */
  .accent-gold {
    --accent: var(--color-gold);
    --accent-soft: rgba(200, 168, 78, 0.25);
    --accent-glow: rgba(200, 168, 78, 0.35);
  }
  .accent-crimson {
    --accent: #c84e4e;
    --accent-soft: rgba(200, 78, 78, 0.25);
    --accent-glow: rgba(200, 78, 78, 0.35);
  }
  .accent-blue {
    --accent: var(--color-blue);
    --accent-soft: rgba(74, 154, 234, 0.25);
    --accent-glow: rgba(74, 154, 234, 0.35);
  }
  .accent-green {
    --accent: var(--color-green);
    --accent-soft: rgba(90, 190, 138, 0.25);
    --accent-glow: rgba(90, 190, 138, 0.35);
  }

  .hero-screenshots {
    width: 100%;
    margin: 0 auto;
  }

  .hero-text {
    text-align: center;
    margin-bottom: 40px;
    max-width: 820px;
    margin-left: auto;
    margin-right: auto;
    padding: 0 16px;
  }

  .hero-eyebrow {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 3px;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  .hero-title {
    font-family: var(--font-pixel);
    font-size: clamp(18px, 2.8vw, 28px);
    color: var(--color-text);
    line-height: 1.7;
    margin: 0;
  }

  /* ── Shared frame styles ─────────────────────────────────── */

  .frame {
    margin: 0;
    background: #05071a;
    border: 1px solid var(--accent);
    border-radius: 4px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px var(--accent-soft),
      0 0 40px var(--accent-glow),
      0 20px 60px rgba(0, 0, 0, 0.6);
    transition:
      transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.4s;
  }

  .frame img {
    display: block;
    width: 100%;
    height: auto;
  }

  .caption {
    font-family: var(--font-heading);
    font-size: 12px;
    color: var(--color-text-muted);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    padding: 10px 16px;
    border-top: 1px solid rgba(74, 90, 173, 0.2);
    background: rgba(5, 7, 26, 0.6);
  }

  /* ── Variant: Stacked ────────────────────────────────────── */

  .stacked-frames {
    display: flex;
    flex-direction: column;
    gap: 32px;
    max-width: 820px;
    margin: 0 auto;
    padding: 0 16px;
  }

  .variant-stacked .frame:hover {
    transform: translateY(-4px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px var(--accent),
      0 0 60px var(--accent-glow),
      0 28px 70px rgba(0, 0, 0, 0.7);
  }

  /* ── Variant: Overlap ────────────────────────────────────── */

  .overlap-stage {
    position: relative;
    max-width: 1000px;
    margin: 0 auto;
    min-height: 560px;
    padding: 40px 24px;
  }

  .overlap-frame {
    position: absolute;
    width: 62%;
    transition:
      transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.6s;
  }

  .overlap-frame-0 {
    left: 3%;
    top: 10px;
    transform: rotate(-2.2deg);
    z-index: 2;
  }

  .overlap-frame-1 {
    right: 3%;
    bottom: 10px;
    transform: rotate(1.8deg);
    z-index: 3;
  }

  .overlap-frame-0:hover {
    transform: rotate(-2.2deg) translateY(-8px);
    z-index: 4;
  }

  .overlap-frame-1:hover {
    transform: rotate(1.8deg) translateY(-8px);
    z-index: 4;
  }

  /* ── Variant: Carousel ───────────────────────────────────── */

  .carousel {
    max-width: 820px;
    margin: 0 auto;
    padding: 0 16px;
  }

  .carousel-viewport {
    display: grid;
    grid-template-areas: "frame";
  }

  .carousel-frame {
    grid-area: frame;
    opacity: 0;
    transform: translateY(12px);
    pointer-events: none;
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }

  .carousel-frame.active {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .carousel-dots {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 24px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(200, 168, 78, 0.15);
    border: 1px solid var(--accent-soft);
    cursor: pointer;
    padding: 0;
    transition:
      background 0.3s,
      box-shadow 0.3s,
      transform 0.3s;
  }

  .dot:hover {
    background: var(--accent-soft);
  }

  .dot.active {
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
    transform: scale(1.15);
  }

  /* ── Responsive ─────────────────────────────────────────── */

  @media (max-width: 800px) {
    .overlap-stage {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 16px;
    }

    .overlap-frame {
      position: relative;
      width: 100%;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      transform: none !important;
    }

    .overlap-frame:hover {
      transform: translateY(-4px) !important;
    }

    .stacked-frames {
      gap: 20px;
    }
  }
</style>
