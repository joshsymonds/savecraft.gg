<!--
  @component
  Marketing hero showcase of real product screenshots. Three visual variants:
  stacked (top-to-bottom), overlap (offset cards with depth), and carousel
  (single visible frame with indicator dots). Selected via the `variant` prop
  so all three render via a single component — the page picks one.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Frame {
    src: string;
    alt: string;
    caption?: string;
  }

  interface Props {
    frames: Frame[];
    variant?: "stacked" | "overlap" | "carousel" | "solo" | "solo-peek" | "side-solo";
    accent?: "gold" | "crimson" | "blue" | "green";
    title?: string;
    eyebrow?: string;
    /** Short descriptive paragraph under the title. */
    subtitle?: string;
    /** Snippet slot for CTA buttons/links rendered below subtitle. */
    actions?: Snippet;
    /** Carousel only. Milliseconds between auto-advance. 0 disables. */
    autoAdvanceMs?: number;
  }

  let {
    frames,
    variant = "stacked",
    accent = "gold",
    title,
    eyebrow,
    subtitle,
    actions,
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
  {#if eyebrow || title || subtitle || actions}
    <div class="hero-text">
      {#if eyebrow}<div class="hero-eyebrow">{eyebrow}</div>{/if}
      {#if title}<h1 class="hero-title">{title}</h1>{/if}
      {#if subtitle}<p class="hero-subtitle">{subtitle}</p>{/if}
      {#if actions}<div class="hero-actions">{@render actions()}</div>{/if}
    </div>
  {/if}

  {#if variant === "stacked"}
    <div class="stacked-frames">
      {#each frames as frame, i (i)}
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
      {#each frames.slice(0, 3) as frame, i (i)}
        <figure class="frame overlap-frame overlap-frame-{i}">
          <img src={frame.src} alt={frame.alt} loading={i === 1 ? "eager" : "lazy"} />
          {#if frame.caption}
            <figcaption class="caption">{frame.caption}</figcaption>
          {/if}
        </figure>
      {/each}
    </div>
  {:else if variant === "solo"}
    <div class="solo-stage">
      <figure class="frame solo-frame">
        <img src={frames[0]?.src} alt={frames[0]?.alt ?? ""} loading="eager" />
        {#if frames[0]?.caption}
          <figcaption class="caption">{frames[0].caption}</figcaption>
        {/if}
      </figure>
    </div>
  {:else if variant === "solo-peek"}
    <div class="solo-peek-stage">
      {#if frames[1]}
        <figure class="frame solo-peek-left">
          <img src={frames[1].src} alt={frames[1].alt} loading="lazy" />
        </figure>
      {/if}
      <figure class="frame solo-peek-main">
        <img src={frames[0]?.src} alt={frames[0]?.alt ?? ""} loading="eager" />
        {#if frames[0]?.caption}
          <figcaption class="caption">{frames[0].caption}</figcaption>
        {/if}
      </figure>
      {#if frames[2]}
        <figure class="frame solo-peek-right">
          <img src={frames[2].src} alt={frames[2].alt} loading="lazy" />
        </figure>
      {/if}
    </div>
  {:else if variant === "side-solo"}
    <div class="side-solo-stage">
      <figure class="frame side-solo-frame">
        <img src={frames[0]?.src} alt={frames[0]?.alt ?? ""} loading="eager" />
        {#if frames[0]?.caption}
          <figcaption class="caption">{frames[0].caption}</figcaption>
        {/if}
      </figure>
    </div>
  {:else if variant === "carousel"}
    <div class="carousel">
      <div class="carousel-viewport">
        {#each frames as frame, i (i)}
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
          {#each frames as frame, i (i)}
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
    --accent-soft: rgba(200, 168, 78, 0.2);
    --accent-glow: rgba(200, 168, 78, 0.22);
  }
  .accent-crimson {
    --accent: #c84e4e;
    --accent-soft: rgba(200, 78, 78, 0.2);
    --accent-glow: rgba(200, 78, 78, 0.22);
  }
  .accent-blue {
    --accent: var(--color-blue);
    --accent-soft: rgba(74, 154, 234, 0.2);
    --accent-glow: rgba(74, 154, 234, 0.22);
  }
  .accent-green {
    --accent: var(--color-green);
    --accent-soft: rgba(90, 190, 138, 0.2);
    --accent-glow: rgba(90, 190, 138, 0.22);
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

  .hero-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.55;
    margin: 20px auto 0;
    max-width: 440px;
  }

  .hero-actions {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    justify-content: center;
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

  /*
    Side-by-side layout on desktop: title column left, overlap stage right.
    Stacks vertically below 900px. Matches the Magic page's hero grid pattern
    (text column + demo column).
  */
  .variant-overlap {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
  }

  @media (min-width: 900px) {
    .variant-overlap {
      display: grid;
      grid-template-columns: minmax(240px, 0.9fr) minmax(0, 2.2fr);
      gap: 40px;
      align-items: center;
    }

    .variant-overlap .hero-text {
      text-align: left;
      margin: 0;
      padding: 0;
      max-width: none;
    }

    .variant-overlap .hero-subtitle {
      margin: 20px 0 0;
    }

    .variant-overlap .hero-actions {
      justify-content: flex-start;
    }
  }

  /*
    Three frames fanned: back-left, middle-front, back-right. Middle has
    the highest z-index so it feels like the focal point. Rotation angles
    give the spread; padding-top/bottom on the stage (plus positive top/
    bottom on frames) keeps the rotated corners from clipping at the hero
    fold. Each frame's img also bounds with max-height + object-fit cover
    so unusually tall screenshots crop to the top instead of stretching
    the stage.
  */
  .overlap-stage {
    position: relative;
    min-height: 540px;
    padding: 52px 0 36px;
  }

  .overlap-frame {
    position: absolute;
    transition:
      transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.6s;
  }

  .overlap-frame img {
    object-fit: cover;
    object-position: top;
  }

  /*
    Middle frame is the focal hero image — wider and taller than the two
    supporting flanking frames, so it reads clearly as the primary. Only
    the middle frame breathes (subtle pulsing glow) to avoid a "busy"
    feeling with all three frames pulsing at once.
  */
  .overlap-frame-0 {
    left: 0;
    top: 30px;
    width: 68%;
    transform: rotate(-6deg);
    z-index: 1;
  }

  .overlap-frame-0 img {
    max-height: 400px;
  }

  .overlap-frame-1 {
    left: 14%;
    top: 0;
    width: 82%;
    transform: rotate(3deg);
    z-index: 3;
    animation: breathe-glow 5s ease-in-out infinite;
  }

  .overlap-frame-1 img {
    max-height: 500px;
  }

  .overlap-frame-2 {
    right: 0;
    bottom: 10px;
    width: 68%;
    transform: rotate(7deg);
    z-index: 2;
  }

  .overlap-frame-2 img {
    max-height: 400px;
  }

  .overlap-frame-0:hover {
    transform: rotate(-6deg) translateY(-8px);
    z-index: 4;
  }

  .overlap-frame-1:hover {
    transform: rotate(3deg) translateY(-10px);
    z-index: 4;
    animation-play-state: paused;
  }

  .overlap-frame-2:hover {
    transform: rotate(7deg) translateY(-8px);
    z-index: 4;
  }

  /*
    Breathing glow — cycles the middle frame's outer accent glow between
    a baseline and a modest peak. Subtle; feels alive without distracting.
    Only the focal middle frame breathes; the two flanking frames stay
    visually stable so the whole cluster doesn't feel busy.
  */
  @keyframes breathe-glow {
    0%,
    100% {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.04),
        0 0 0 1px var(--accent-soft),
        0 0 18px var(--accent-glow),
        0 20px 60px rgba(0, 0, 0, 0.6);
    }
    50% {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.04),
        0 0 0 1px var(--accent-soft),
        0 0 32px var(--accent-glow),
        0 20px 60px rgba(0, 0, 0, 0.6);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlap-frame-1 {
      animation: none;
    }
  }

  /*
    ── Variant: Solo ─────────────────────────────────────────
    Centered title block on top, one tall product screenshot below.
    Raycast/Vercel/Arc pattern. Lets the screenshot be hero-size without
    competing with text for the same horizontal axis.
  */

  .variant-solo {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 32px;
  }

  .variant-solo .hero-text {
    text-align: center;
    max-width: 720px;
    margin: 0 auto 56px;
    padding: 0;
  }

  .solo-stage {
    display: flex;
    justify-content: center;
  }

  .solo-frame {
    width: 100%;
    max-width: 720px;
  }

  .solo-frame img {
    width: 100%;
    max-height: 620px;
    object-fit: cover;
    object-position: top;
  }

  /*
    ── Variant: Solo-peek ────────────────────────────────────
    Centered title on top, main frame centered below with a smaller
    second frame peeking from behind at a shallow angle. Hints at depth
    and variety without the three-card clutter. frames[0] is main,
    frames[1] is the peek.
  */

  .variant-solo-peek {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
  }

  .variant-solo-peek .hero-text {
    text-align: center;
    max-width: 720px;
    margin: 0 auto 56px;
    padding: 0;
  }

  .solo-peek-stage {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 620px;
  }

  .solo-peek-main {
    width: 100%;
    max-width: 680px;
    position: relative;
    z-index: 2;
    animation: breathe-glow 5s ease-in-out infinite;
  }

  .solo-peek-main img {
    width: 100%;
    max-height: 620px;
    object-fit: cover;
    object-position: top;
  }

  /*
    Two peeks — one on each side — at similar size. On hover, either peek
    grows and rises above the main so it visually replaces it. The main
    dims when a peek is being hovered to reinforce the swap. Transform-
    origin on each peek biases growth toward the center, so the hovered
    peek expands inward over the main rather than off-screen.
  */
  .solo-peek-left,
  .solo-peek-right {
    position: absolute;
    width: 420px;
    z-index: 1;
    opacity: 0.8;
    transition:
      transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.3s,
      z-index 0s 0.2s;
    cursor: pointer;
  }

  .solo-peek-left img,
  .solo-peek-right img {
    width: 100%;
    max-height: 480px;
    object-fit: cover;
    object-position: top;
  }

  /*
    Peeks are vertically centered on the main using top: 50% + translateY.
    transform-origin is set to the OUTER edge (left for left peek, right
    for right peek) so hover scaling anchors there and grows INWARD over
    the main — not outward off-screen.
  */
  .solo-peek-left {
    left: 2%;
    top: 50%;
    transform: translateY(-50%) rotate(-5deg);
    transform-origin: left center;
  }

  .solo-peek-right {
    right: 2%;
    top: 50%;
    transform: translateY(-50%) rotate(5deg);
    transform-origin: right center;
  }

  .solo-peek-left:hover,
  .solo-peek-right:hover {
    transform: translateY(-50%) rotate(0deg) scale(1.55);
    opacity: 1;
    z-index: 5;
  }

  .solo-peek-stage:has(.solo-peek-left:hover) .solo-peek-main,
  .solo-peek-stage:has(.solo-peek-right:hover) .solo-peek-main {
    opacity: 0.08;
    transform: scale(0.92);
    transition:
      opacity 0.35s,
      transform 0.5s;
  }

  /*
    ── Variant: Side-solo ────────────────────────────────────
    Text column left, SINGLE product frame right. Same grid we iterated
    on for the overlap variant, minus the fan. The text gets breathing
    room because only one portrait card sits next to it.
  */

  .variant-side-solo {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
  }

  @media (min-width: 900px) {
    .variant-side-solo {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(0, 1.3fr);
      gap: 56px;
      align-items: center;
    }

    .variant-side-solo .hero-text {
      text-align: left;
      margin: 0;
      padding: 0;
      max-width: none;
    }

    .variant-side-solo .hero-subtitle {
      margin: 20px 0 0;
    }

    .variant-side-solo .hero-actions {
      justify-content: flex-start;
    }
  }

  .side-solo-stage {
    display: flex;
    justify-content: center;
  }

  .side-solo-frame {
    width: 100%;
    max-width: 520px;
    transform: rotate(-1.5deg);
    animation: breathe-glow 5s ease-in-out infinite;
  }

  .side-solo-frame img {
    width: 100%;
    max-height: 580px;
    object-fit: cover;
    object-position: top;
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

    /* Hide both peeks on mobile — they would crowd the main frame. */
    .solo-peek-left,
    .solo-peek-right {
      display: none;
    }

    .solo-peek-stage {
      min-height: 0;
      padding: 0;
    }

    .side-solo-frame {
      transform: none;
    }
  }
</style>
