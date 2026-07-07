<!--
  @component
  Shared game landing page. Renders an entire per-game marketing page —
  SEO head, themed hero, data-sources readout, and an ordered list of
  section descriptors — from a typed GamePageContent module plus the
  game's plugin manifest data. Every game page on the site goes through
  this component, so the SEO head and the visual system are complete by
  construction.
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
  import SocialMeta from "$lib/components/SocialMeta.svelte";
  import { jsonLd } from "$lib/jsonld";
  import type { GameInfo } from "$lib/server/plugins";

  import ConversationDemo from "./ConversationDemo.svelte";
  import type { GamePageContent } from "./game-page";
  import HeroScreenshots from "./HeroScreenshots.svelte";
  import MarketingSection from "./MarketingSection.svelte";
  import ModeCard from "./ModeCard.svelte";
  import ModuleBadge from "./ModuleBadge.svelte";
  import ParticleField from "./ParticleField.svelte";

  let { content, game } = $props<{ content: GamePageContent; game: GameInfo }>();

  const seo = $derived(content.seo);
  const theme = $derived(content.theme);
  const hero = $derived(content.hero);
  const url = $derived(`https://savecraft.gg${seo.path}`);
  const slug = $derived(seo.path.replace(/^\//, ""));
  const signIn = `${PUBLIC_APP_URL}/sign-in`;
  const themeStyle = $derived(
    [
      `--g-accent:${theme.accent}`,
      `--g-accent-bright:${theme.accentBright}`,
      `--g-on-accent:${theme.onAccent}`,
    ].join(";"),
  );
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.metaDescription} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of static data, escaped in jsonLd() -->
  {@html jsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seo.title,
    url,
    description: seo.jsonDescription,
    about: {
      "@type": "VideoGame",
      name: content.gameName,
    },
  })}
</svelte:head>

<SocialMeta {slug} title={seo.ogTitle} description={seo.ogDescription} {url} />

<div class="page" style={themeStyle}>
  <!-- ═══ HERO ═══ -->
  <div class="hero-bg" style="background:{theme.heroBackground}">
    <ParticleField seed={theme.particleSeed} />
    <div class="hero-scanlines" aria-hidden="true"></div>

    <section class="hero">
      {#if hero.frames}
        <HeroScreenshots
          variant={hero.variant ?? "solo-peek"}
          accent={theme.heroAccent}
          eyebrow={hero.eyebrow}
          title={hero.title}
          subtitle={hero.subtitle}
          actions={heroActions}
          frames={hero.frames}
        />
      {:else if hero.demo}
        <div class="demo-hero">
          <div class="demo-hero-text">
            <div class="demo-hero-eyebrow">{hero.eyebrow}</div>
            <h1 class="demo-hero-title">{hero.title}</h1>
            <p class="demo-hero-subtitle">{hero.subtitle}</p>
            <div class="demo-hero-actions">
              {@render heroActions()}
            </div>
          </div>
          <div class="demo-hero-panel">
            <ConversationDemo
              conversation={hero.demo.conversation}
              headerLabel={hero.demo.headerLabel}
              headerDotColor="var(--g-accent)"
              startDelay={600}
            />
          </div>
        </div>
      {/if}
    </section>
  </div>

  {#snippet heroActions()}
    <a href={hero.primaryCta.href ?? signIn} class="btn-primary">{hero.primaryCta.label}</a>
    {#if hero.secondaryCta}
      <a href={hero.secondaryCta.href ?? signIn} class="btn-outline">{hero.secondaryCta.label}</a>
    {/if}
  {/snippet}

  <!-- ═══ DATA SOURCES READOUT ═══ -->
  <div class="proof-bar">
    <span class="proof-tag" aria-hidden="true">DATA</span>
    {#each content.proofItems as item, i (item)}
      {#if i > 0}<span class="proof-sep" aria-hidden="true"></span>{/if}
      <span class="proof-item">{item}</span>
    {/each}
    <span class="proof-cursor" aria-hidden="true"></span>
  </div>

  <!-- ═══ SECTIONS ═══ -->
  {#each content.sections as section (section.eyebrow + section.title)}
    <MarketingSection
      id={section.id}
      eyebrow={section.eyebrow}
      title={section.title}
      subtitle={section.subtitle}
      eyebrowColor="var(--g-accent)"
      treatment={section.treatment ?? "plain"}
    >
      {#if section.kind === "modules"}
        <div class="modules-grid">
          {#each game.referenceModules as mod, i (mod.name)}
            <div class="module-card" style="--i:{i}">
              <div class="module-title-row">
                <h3 class="module-name">{mod.name}</h3>
                <ModuleBadge requiresSave={mod.requires_save} />
              </div>
              <p class="module-desc">{mod.description}</p>
            </div>
          {/each}
        </div>
      {:else if section.kind === "methodGrid"}
        <div class="method-grid">
          {#each section.items as item, i (item.source)}
            <div class="method-item" style="--i:{i}">
              <span class="method-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span class="method-source">{item.source}</span>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- descs are static site-authored strings from content modules, may carry <code> -->
              <span class="method-desc">{@html item.desc}</span>
            </div>
          {/each}
        </div>
        {#if section.ctaLabel}
          <div class="section-cta">
            <a href={signIn} class="btn-primary">{section.ctaLabel}</a>
          </div>
        {/if}
      {:else if section.kind === "compare"}
        {#each section.pairs as pair, p (pair.headerLabel)}
          <div class="compare-grid" class:compare-grid-second={p > 0}>
            <div class="compare-card compare-without">
              <div class="compare-header">
                <span class="compare-dot" aria-hidden="true"></span>
                WITHOUT SAVECRAFT
              </div>
              <div class="compare-body">
                {#each pair.without as msg (msg.text)}
                  <div class="without-msg">
                    <span class="without-role" class:role-player={msg.role === "player"}
                      >{msg.role === "player" ? "YOU" : "AI"}</span
                    >
                    <span class="without-text">{msg.text}</span>
                  </div>
                {/each}
              </div>
              <p class="compare-caption compare-caption-bad">{pair.withoutCaption}</p>
            </div>

            <div class="compare-vs" aria-hidden="true"></div>

            <div class="compare-card compare-with">
              <ConversationDemo
                conversation={pair.with}
                headerLabel={pair.headerLabel}
                headerDotColor="var(--color-green)"
                startDelay={800}
              />
              <p class="compare-caption compare-caption-good">{pair.withCaption}</p>
            </div>
          </div>
        {/each}
      {:else if section.kind === "modes"}
        <div class="modes-grid">
          {#each section.cards as card (card.label)}
            <ModeCard
              icon={card.icon}
              label={card.label}
              color={card.color}
              examples={card.examples}
            />
          {/each}
        </div>
      {:else if section.kind === "flow"}
        <div class="flow-grid">
          {#each section.steps as step, i (step.title)}
            <div class="flow-step" style="--i:{i}">
              <div class="flow-num" aria-hidden="true">{i + 1}</div>
              <div class="flow-body">
                <h3 class="flow-title">{step.title}</h3>
                <p class="flow-desc">{step.desc}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </MarketingSection>
  {/each}

  <!-- ═══ FINAL CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">{content.cta.title}</h2>
      <p class="cta-sub">{content.cta.sub}</p>
      <div class="cta-actions">
        <a href={signIn} class="btn-primary btn-large">{content.cta.label}</a>
      </div>
    </div>
  </section>
</div>

<style>
  /* ── Page & theme plumbing ────────────────────────────────
     Per-game palette arrives as --g-accent / --g-accent-bright /
     --g-on-accent; every tint below derives from those, so a new
     game needs exactly three colors and a hero gradient. */
  .page {
    min-height: 100vh;
    overflow-x: hidden;
    --g-soft: color-mix(in srgb, var(--g-accent) 14%, transparent);
    --g-softer: color-mix(in srgb, var(--g-accent) 7%, transparent);
    --g-line: color-mix(in srgb, var(--g-accent) 32%, transparent);
  }

  /* ── Hero atmosphere ──────────────────────────────────── */
  .hero-bg {
    position: relative;
    overflow: hidden;
  }

  /* CRT scanline film over the hero art — texture, not gimmick. */
  .hero-scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 3px,
      rgba(0, 0, 0, 0.14) 3px,
      rgba(0, 0, 0, 0.14) 4px
    );
    mix-blend-mode: overlay;
  }

  .hero {
    position: relative;
    z-index: 1;
    padding: 140px 0 60px;
  }

  /* ── Demo-led hero (games without capture assets) ─────── */
  .demo-hero {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
    gap: 48px;
    align-items: center;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 32px;
  }

  .demo-hero-eyebrow {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--g-accent);
    letter-spacing: 3px;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  .demo-hero-title {
    font-family: var(--font-pixel);
    font-size: var(--text-hero);
    color: var(--color-text);
    line-height: 1.7;
    margin: 0;
  }

  .demo-hero-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.55;
    margin: 20px 0 0;
    max-width: 480px;
  }

  .demo-hero-actions {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
  }

  .demo-hero-panel {
    min-width: 0;
  }

  /* ── Buttons ──────────────────────────────────────────── */
  .btn-primary {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--g-on-accent);
    background: linear-gradient(135deg, var(--g-accent), var(--g-accent-bright));
    padding: 14px 28px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition:
      box-shadow 0.2s,
      transform 0.2s;
    box-shadow: 0 0 15px color-mix(in srgb, var(--g-accent) 30%, transparent);
    border: none;
    cursor: pointer;
  }

  .btn-primary:hover {
    box-shadow: 0 0 25px color-mix(in srgb, var(--g-accent) 50%, transparent);
    transform: translateY(-1px);
  }

  .btn-primary:focus-visible,
  .btn-outline:focus-visible {
    outline: 2px solid var(--g-accent-bright);
    outline-offset: 3px;
  }

  .btn-outline {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 14px 28px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition:
      border-color 0.2s,
      color 0.2s;
  }

  .btn-outline:hover {
    border-color: var(--g-accent);
    color: var(--g-accent-bright);
  }

  .btn-large {
    font-size: 16px;
    padding: 16px 40px;
  }

  /* ── Data-sources readout ─────────────────────────────── */
  .proof-bar {
    background: rgba(5, 7, 26, 0.72);
    border-top: 1px solid var(--g-line);
    border-bottom: 1px solid var(--g-line);
    padding: 16px 32px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: center;
    align-items: center;
  }

  .proof-tag {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2.5px;
    color: var(--g-on-accent);
    background: var(--g-accent);
    padding: 3px 8px 2px;
    border-radius: 1px;
  }

  .proof-item {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .proof-sep {
    width: 5px;
    height: 5px;
    background: var(--g-accent);
    opacity: 0.65;
    transform: rotate(45deg);
    flex-shrink: 0;
  }

  .proof-cursor {
    width: 8px;
    height: 15px;
    background: var(--g-accent);
    opacity: 0.8;
    animation: cursor-blink 1.1s steps(1) infinite;
  }

  @keyframes cursor-blink {
    50% {
      opacity: 0;
    }
  }

  /* ── Module cards: HUD target frames ──────────────────── */
  .modules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }

  .module-card {
    position: relative;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 20px 22px;
    transition:
      border-color 0.25s,
      transform 0.25s,
      box-shadow 0.25s;
    animation: fade-slide-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 70ms);
  }

  /* HUD corner brackets — top-left and bottom-right ticks. */
  .module-card::before,
  .module-card::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    border: 1px solid var(--g-line);
    transition:
      border-color 0.25s,
      width 0.25s,
      height 0.25s;
    pointer-events: none;
  }

  .module-card::before {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }

  .module-card::after {
    bottom: -1px;
    right: -1px;
    border-left: none;
    border-top: none;
  }

  .module-card:hover {
    border-color: var(--g-line);
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }

  .module-card:hover::before,
  .module-card:hover::after {
    border-color: var(--g-accent);
    width: 22px;
    height: 22px;
  }

  .module-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 10px;
  }

  .module-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--g-accent);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin: 0;
  }

  .module-desc {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-text-dim);
    margin: 0;
  }

  /* ── Compare: two chat windows and a VS pip ───────────── */
  .compare-grid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    align-items: start;
  }

  .compare-grid-second {
    margin-top: 48px;
  }

  .compare-vs {
    position: absolute;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%) rotate(45deg);
    width: 34px;
    height: 34px;
    border: 1px solid var(--g-line);
    background: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }

  .compare-vs::after {
    content: "VS";
    transform: rotate(-45deg);
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--g-accent);
  }

  .compare-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .compare-without {
    background: rgba(232, 90, 90, 0.05);
    border: 1px solid rgba(232, 90, 90, 0.25);
    border-radius: 4px;
    padding: 16px 18px;
  }

  .compare-header {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--color-red);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(232, 90, 90, 0.2);
  }

  .compare-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-red);
    box-shadow: 0 0 6px var(--color-red);
  }

  .compare-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 8px 0;
  }

  .without-msg {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .without-role {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--color-red);
  }

  .without-role.role-player {
    color: var(--color-green);
  }

  .without-text {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
    color: var(--color-text-dim);
  }

  .compare-caption {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    margin: 0;
    padding: 0 4px;
  }

  .compare-caption-bad {
    color: rgba(232, 90, 90, 0.85);
  }

  .compare-caption-good {
    color: rgba(90, 190, 138, 0.9);
  }

  /* ── Modes ────────────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  /* ── Flow: numbered HUD chips ─────────────────────────── */
  .flow-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .flow-step {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    animation: fade-slide-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 90ms);
  }

  .flow-num {
    font-family: var(--font-heading);
    font-size: 26px;
    font-weight: 700;
    color: var(--g-accent);
    min-width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--g-line);
    background: var(--g-softer);
  }

  .flow-body {
    flex: 1;
  }

  .flow-title {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin: 0 0 8px;
  }

  .flow-desc {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-text-dim);
    margin: 0;
  }

  /* ── Method grid: source ledger ───────────────────────── */
  .method-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 28px;
  }

  .method-item {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 24px;
    border-left: 2px solid var(--g-accent);
    background: rgba(5, 7, 26, 0.3);
    animation: fade-slide-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 70ms);
  }

  .method-index {
    position: absolute;
    top: 20px;
    right: 22px;
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--g-line);
  }

  .method-source {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--g-accent);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .method-desc {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.6;
    color: var(--color-text-dim);
  }

  .method-desc :global(code) {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
    color: var(--g-accent);
    background: var(--g-softer);
    padding: 1px 6px;
    border-radius: 2px;
  }

  .section-cta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 28px;
  }

  /* ── Final CTA ────────────────────────────────────────── */
  .cta-section {
    padding: 100px 32px 140px;
    text-align: center;
  }

  .cta-inner {
    max-width: 720px;
    margin: 0 auto;
  }

  .cta-title {
    font-family: var(--font-pixel);
    font-size: clamp(18px, 2.5vw, 26px);
    color: var(--color-text);
    line-height: 1.7;
    margin: 0 0 18px;
  }

  .cta-sub {
    font-family: var(--font-heading);
    font-size: 17px;
    color: var(--color-text-dim);
    margin: 0 0 32px;
  }

  .cta-actions {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
  }

  /* ── Motion discipline ────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .module-card,
    .flow-step,
    .method-item {
      animation: none;
    }

    .proof-cursor {
      animation: none;
    }

    .module-card:hover {
      transform: none;
    }
  }

  /* ── Responsive ───────────────────────────────────────── */
  @media (max-width: 900px) {
    .hero {
      padding: 100px 0 40px;
    }

    .demo-hero {
      grid-template-columns: 1fr;
      gap: 36px;
      padding: 0 20px;
    }

    .modules-grid,
    .compare-grid,
    .modes-grid,
    .flow-grid,
    .method-grid {
      grid-template-columns: 1fr;
    }

    .compare-grid {
      gap: 24px;
    }

    .compare-vs {
      display: none;
    }
  }
</style>
