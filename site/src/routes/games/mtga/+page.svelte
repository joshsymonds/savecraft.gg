<!--
  @component
  MTGA game landing page — showcases AI coaching capabilities for Magic: The Gathering Arena.
  Targets Arena drafters (r/MagicArena, r/lrcast) with data-backed credibility.
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
  import {
    ConversationDemo,
    MarketingSection,
    ModeCard,
    ParticleField,
  } from "$lib/components/marketing";
  import type { DemoMessage } from "$lib/components/marketing/types";
  import type { GameInfo } from "$lib/server/plugins";

  let { data } = $props<{ data: { game: GameInfo } }>();

  const conversation: DemoMessage[] = [
    { role: "player", text: "Just went 2-3 in Tarkir again. Can you review my draft?" },
    {
      role: "ai",
      text: "Looking at your picks: P1P3 you took Abzan Kin-Guard over Pacifism. In Selesnya, Pacifism's GIH WR is 60.2% vs Kin-Guard's 57.1%. That's a significant gap — premium removal rarely wheels.",
    },
    { role: "player", text: "I thought I needed creatures. Was the rest of the draft OK?" },
    {
      role: "ai",
      text: "Mostly solid. Your bigger issue is the mana base — you're running a GG spell on 7 green sources. Karsten says you need 10 for 89% on-curve consistency. You also splashed black with zero fixing, which dropped your expected win rate by ~4%.",
    },
  ];

  // Reference modules that work without the daemon (server-side only, no Player.log needed)
  const INSTANT_MODULE_NAMES = new Set([
    "Rules Search",
    "Card Search",
    "Card Stats",
    "Draft Ratings",
    "Mana Base",
  ]);

  let referenceModules = $derived(data.game.referenceModules);
  let instantModules = $derived(
    referenceModules.filter((m: { name: string }) => INSTANT_MODULE_NAMES.has(m.name)),
  );
</script>

<svelte:head>
  <title>Magic: The Gathering Arena — AI Coaching | Savecraft</title>
  <meta
    name="description"
    content="Your AI assistant coaches your Magic drafts and decks using real data from 17Lands, Frank Karsten's mana base methodology, and the MTG Comprehensive Rules."
  />
  <meta property="og:title" content="Savecraft — AI Coaching for MTG Arena" />
  <meta
    property="og:description"
    content="Draft analysis across 31 color archetypes, deck health checks, mana base math, and rules lookup — powered by Bayesian-calibrated 17Lands data."
  />
  <meta property="og:url" content="https://savecraft.gg/games/mtga" />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="page">
  <!-- ═══ HERO ═══ -->
  <div class="hero-bg">
    <ParticleField seed={137} />

    <section class="hero">
      <div class="hero-grid">
        <div class="hero-text">
          <div class="hero-eyebrow">AI COACHING FOR MAGIC: THE GATHERING</div>
          <h1 class="hero-title">
            Your AI knows<br />the format.
          </h1>
          <p class="hero-sub">
            Savecraft gives your AI access to your Arena data — collection, drafts, decks — plus
            deep reference tools backed by 17Lands stats, Frank Karsten's mana math, and the full
            MTG rules. Real coaching, not guesswork.
          </p>
          <div class="hero-actions">
            <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">GET STARTED</a>
            <a href="#tools" class="btn-outline">SEE THE TOOLS</a>
          </div>
        </div>

        <ConversationDemo
          {conversation}
          headerLabel="MTG ARENA — TARKIR DRAFT REVIEW"
          headerDotColor="var(--color-gold)"
          startDelay={1000}
        />
      </div>
    </section>
  </div>

  <!-- ═══ CREDIBILITY BAR ═══ -->
  <div class="proof-bar">
    <span class="proof-item">17Lands data across 31 color archetypes</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Frank Karsten mana base methodology</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Scryfall + MTG Comprehensive Rules</span>
  </div>

  <!-- ═══ WHAT YOUR AI KNOWS ═══ -->
  <MarketingSection
    id="tools"
    eyebrow="REFERENCE TOOLS"
    title="Eight modules. Real data."
    subtitle="Your AI doesn't guess — it queries. Every answer is grounded in actual game data and published methodology."
  >
    <div class="modules-grid">
      {#each referenceModules as mod (mod.name)}
        <div class="module-card">
          <h3 class="module-name">{mod.name}</h3>
          <p class="module-desc">{mod.description}</p>
        </div>
      {/each}
    </div>
  </MarketingSection>

  <!-- ═══ COACHING MODES ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Draft coach and deck doctor"
    subtitle="Same AI, same game data. Whether you want a sounding board or a second opinion on cuts."
  >
    <div class="modes-grid">
      <ModeCard
        icon="*"
        label="DRAFT COACH"
        color="var(--color-gold)"
        examples={[
          {
            role: "player",
            text: "P1P5 — is the format fast enough for a 6-drop here?",
          },
          {
            role: "ai",
            text: "In Selesnya the average game goes 8.3 turns. A 6-drop with 58.1% GIH WR is playable — but your curve already has three 5+ drops. Take the Pacifism instead; you need removal more than top-end.",
          },
        ]}
      />
      <ModeCard
        icon="+"
        label="DECK DOCTOR"
        color="var(--color-green)"
        examples={[
          { role: "player", text: "I have 24 playables. What do I cut?" },
          {
            role: "ai",
            text: "Your weakest cards by composite score: Tusked Rager (low synergy with your +1/+1 counter theme, 52.3% GIH WR), and Summit Prowler (you only have 5 red sources, need 8 for RR). Cutting both brings you to a clean 40.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ TWO-TIER CTA ═══ -->
  <MarketingSection
    eyebrow="GET STARTED"
    title="Two ways in"
    subtitle="Reference tools work immediately. Install the daemon to unlock coaching with your actual collection and draft data."
  >
    <div class="tiers-grid">
      <div class="tier-card">
        <div class="tier-header tier-instant">
          <span class="tier-label">TRY IT NOW</span>
          <span class="tier-badge">NO INSTALL</span>
        </div>
        <div class="tier-body">
          <p class="tier-desc">
            Connect Savecraft to Claude or ChatGPT. Your AI immediately gets access to:
          </p>
          <ul class="tier-features">
            {#each instantModules as mod (mod.name)}
              <li>{mod.name}</li>
            {/each}
          </ul>
          <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold tier-cta">CONNECT YOUR AI</a>
        </div>
      </div>

      <div class="tier-card">
        <div class="tier-header tier-deep">
          <span class="tier-label">GO DEEPER</span>
          <span class="tier-badge">YOUR DATA</span>
        </div>
        <div class="tier-body">
          <p class="tier-desc">
            Install the Savecraft daemon to sync your Player.log. Your AI can then coach with your
            actual game state:
          </p>
          <ul class="tier-features">
            <li>Review your draft picks against optimal lines</li>
            <li>Health-check your deck vs winning archetypes</li>
            <li>Calculate wildcard cost for any decklist</li>
            <li>Track your collection, rank, and inventory</li>
          </ul>
          <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-outline tier-cta">GET STARTED</a>
        </div>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ METHODOLOGY ═══ -->
  <MarketingSection
    eyebrow="METHODOLOGY"
    title="We show our work"
    subtitle="Every tool is built on published methodology and public data. No black boxes."
  >
    <div class="method-grid">
      <div class="method-item">
        <span class="method-source">17Lands</span>
        <span class="method-desc">
          Per-card win rates across all 31 color archetypes — mono through five-color — plus synergy
          matrices and draft signal data from millions of real Arena games. Bayesian shrinkage
          ensures sparse archetypes blend toward the overall mean instead of producing noisy
          recommendations. Licensed CC BY 4.0.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">Frank Karsten</span>
        <span class="method-desc">
          Hypergeometric mana base calculations from "How Many Sources Do You Need to Consistently
          Cast Your Spells?" Pre-computed castability tables for exact on-curve probability.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">WASPAS</span>
        <span class="method-desc">
          Weighted Aggregated Sum Product Assessment — a multi-criteria decision method that blends
          8 scoring axes with pick-adaptive weights across all 31 archetype candidates. Early picks
          favor baseline power; late picks favor synergy and castability. Sigmoid-calibrated from
          each set's empirical distribution.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">Scryfall + WotC</span>
        <span class="method-desc">
          Complete card database, oracle text, and the full MTG Comprehensive Rules with semantic
          search via Reciprocal Rank Fusion (keyword + vector embedding).
        </span>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">Draft smarter.</h2>
      <p class="cta-sub">Connect your AI in 30 seconds. Works with Claude and ChatGPT.</p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large">GET STARTED</a>
      </div>
    </div>
  </section>
</div>

<style>
  /* ── Page ─────────────────────────────────────────────── */
  .page {
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Hero background ──────────────────────────────────── */
  .hero-bg {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 25% 15%, rgba(60, 40, 10, 0.4) 0%, transparent 50%),
      radial-gradient(ellipse at 75% 50%, rgba(10, 20, 50, 0.4) 0%, transparent 50%),
      linear-gradient(180deg, #010214 0%, #030518 25%, #060a22 60%, #0a0e2e 100%);
  }

  /* ── Hero ─────────────────────────────────────────────── */
  .hero {
    position: relative;
    z-index: 1;
    padding: 140px 32px 60px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    align-items: center;
  }

  .hero-eyebrow {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gold);
    letter-spacing: 4px;
    margin-bottom: 20px;
    text-transform: uppercase;
  }

  .hero-title {
    font-family: var(--font-pixel);
    font-size: clamp(18px, 2.8vw, 28px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 20px;
  }

  .hero-sub {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    max-width: 480px;
  }

  .hero-actions {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 28px;
  }

  /* ── Buttons ──────────────────────────────────────────── */
  .btn-gold {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: #05071a;
    background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light));
    padding: 14px 28px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: all 0.2s;
    box-shadow: 0 0 15px rgba(200, 168, 78, 0.3);
    border: none;
    cursor: pointer;
  }

  .btn-gold:hover {
    box-shadow: 0 0 25px rgba(200, 168, 78, 0.5);
    transform: translateY(-1px);
  }

  .btn-gold.btn-large {
    font-size: 15px;
    padding: 16px 40px;
  }

  .btn-outline {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-dim);
    padding: 14px 28px;
    border: 1px solid var(--color-border);
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: all 0.2s;
    background: transparent;
  }

  .btn-outline:hover {
    color: var(--color-text);
    border-color: var(--color-border-light);
  }

  /* ── Proof bar ───────────────────────────────────────── */
  .proof-bar {
    position: relative;
    z-index: 1;
    padding: 20px 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    border-top: 1px solid rgba(74, 90, 173, 0.1);
    border-bottom: 1px solid rgba(74, 90, 173, 0.1);
  }

  .proof-item {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
  }

  .proof-sep {
    font-family: var(--font-heading);
    font-size: 12px;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  /* ── Module cards ────────────────────────────────────── */
  .modules-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-top: 32px;
  }

  .module-card {
    padding: 22px 20px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    transition: border-color 0.3s;
  }

  .module-card:hover {
    border-color: var(--color-border-light);
  }

  .module-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .module-desc {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  /* ── Modes ───────────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  /* ── Two-tier CTA ────────────────────────────────────── */
  .tiers-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .tier-card {
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
    transition: border-color 0.3s;
  }

  .tier-card:hover {
    border-color: var(--color-border-light);
  }

  .tier-header {
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(74, 90, 173, 0.2);
    background: rgba(5, 7, 26, 0.4);
  }

  .tier-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .tier-badge {
    font-family: var(--font-pixel);
    font-size: 7px;
    letter-spacing: 1.5px;
    padding: 4px 10px;
    border-radius: 2px;
  }

  .tier-instant .tier-label {
    color: var(--color-green);
  }

  .tier-instant .tier-badge {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.25);
  }

  .tier-deep .tier-label {
    color: var(--color-gold);
  }

  .tier-deep .tier-badge {
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.25);
  }

  .tier-body {
    padding: 22px 20px;
  }

  .tier-desc {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .tier-features {
    list-style: none;
    padding: 0;
    margin: 0 0 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tier-features li {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text);
    padding-left: 18px;
    position: relative;
    line-height: 1.5;
  }

  .tier-features li::before {
    content: "+";
    position: absolute;
    left: 0;
    color: var(--color-green);
    font-weight: 700;
  }

  .tier-cta {
    display: inline-block;
  }

  /* ── Methodology ─────────────────────────────────────── */
  .method-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 32px;
  }

  .method-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 22px 20px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .method-source {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-gold);
    letter-spacing: 1px;
  }

  .method-desc {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  /* ── CTA ──────────────────────────────────────────────── */
  .section {
    padding: 100px 32px;
  }

  .cta-section {
    text-align: center;
    padding: 80px 32px 100px;
  }

  .cta-inner {
    max-width: 600px;
    margin: 0 auto;
  }

  .cta-title {
    font-family: var(--font-pixel);
    font-size: clamp(16px, 2.5vw, 22px);
    color: var(--color-text);
    margin-bottom: 16px;
    line-height: 1.7;
  }

  .cta-sub {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 400;
    color: var(--color-text-dim);
    margin-bottom: 32px;
    line-height: 1.6;
  }

  .cta-actions {
    margin-bottom: 28px;
  }

  /* ── Responsive ──────────────────────────────────────── */
  @media (max-width: 900px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 32px;
    }

    .modules-grid {
      grid-template-columns: 1fr;
    }

    .modes-grid {
      grid-template-columns: 1fr;
    }

    .tiers-grid {
      grid-template-columns: 1fr;
    }

    .method-grid {
      grid-template-columns: 1fr;
    }

    .proof-bar {
      flex-direction: column;
      gap: 8px;
    }

    .proof-sep {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .hero {
      padding: 100px 20px 40px;
    }
  }
</style>
