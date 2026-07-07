<!--
  @component
  Magic: The Gathering landing page -- all-format reference tools (Commander, Standard,
  draft, Legacy) that work the moment Magic is added, plus Arena coaching once Magic is
  reading your Player.log.
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
  import {
    ConversationDemo,
    HeroScreenshots,
    MarketingSection,
    ModeCard,
    ModuleBadge,
    ParticleField,
  } from "$lib/components/marketing";
  import SocialMeta from "$lib/components/SocialMeta.svelte";
  import {
    standardCaptions,
    standardHeaderLabel,
    withoutStandard,
    withStandard,
  } from "$lib/demos/standard-rotation";
  import { jsonLd } from "$lib/jsonld";
  import type { GameInfo } from "$lib/server/plugins";

  import { withCommander, withoutCommander } from "./demos";

  let { data } = $props<{ data: { game: GameInfo } }>();

  const heroFrames = [
    {
      src: "/images/magic/magic-good.jpeg",
      alt: "Claude reviewing a Magic TMNT draft -- user asks 'how did I do?', Claude pulls draft history and renders a 14/12/3/12 Optimal/Good/Questionable/Miss review with a pick timeline filtered by outcome",
    },
    {
      src: "/images/magic/rocks.jpg",
      alt: "Claude recommending 3-CMC mana rocks for Commander -- tabbed grid of Eye / Heart / Horn / Skull / Tooth of Ramos colored by mana identity",
    },
    {
      src: "/images/magic/lifelink.jpg",
      alt: "Claude listing every white lifelink creature 2 mana or less -- framed card grid with rarity chips and abilities",
    },
  ];

  let referenceModules = $derived(data.game.referenceModules);
</script>

<svelte:head>
  <title>Magic: The Gathering -- Real Data for Your AI | Savecraft</title>
  <meta
    name="description"
    content="Real card data for Claude and ChatGPT -- every Magic format, the moment you add the game. EDHREC for Commander, 17Lands for limited, plus the full MTG rules. Add Magic on the machine you play Arena on and your live game state comes along too."
  />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of static data, escaped in jsonLd() -->
  {@html jsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Magic: The Gathering -- Real Data for Your AI | Savecraft",
    url: "https://savecraft.gg/magic",
    description:
      "Real card data for Claude and ChatGPT -- every Magic format, the moment you add the game.",
    about: {
      "@type": "VideoGame",
      name: "Magic: The Gathering",
    },
  })}
</svelte:head>

<SocialMeta
  slug="magic"
  title="Savecraft -- Real MTG Data for Claude and ChatGPT"
  description="Real card data, every Magic format, the moment you add the game. EDHREC for Commander, 17Lands for limited, plus the full MTG rules. Add Magic on the machine you play Arena on and your live game state comes along too."
  url="https://savecraft.gg/magic"
/>

<div class="page">
  <!-- ═══ HERO ═══ -->
  <div class="hero-bg">
    <ParticleField seed={137} />

    <section class="hero">
      <HeroScreenshots
        variant="solo-peek"
        accent="gold"
        eyebrow="MAGIC, WITHOUT THE HALLUCINATED CARDS"
        title="Your AI stops inventing cards here."
        subtitle="Every Magic format, the second you add the game. EDHREC, 17Lands, the full MTG rules. Play Arena? Add Magic on that machine and your live picks come along too."
        actions={heroActions}
        frames={heroFrames}
      />
    </section>
  </div>

  {#snippet heroActions()}
    <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">CONNECT CLAUDE OR CHATGPT</a>
    <a href="#tools" class="btn-outline">SEE WHAT YOUR AI KNOWS</a>
  {/snippet}

  <!-- ═══ CREDIBILITY BAR ═══ -->
  <div class="proof-bar">
    <span class="proof-item">17Lands data across 31 color archetypes</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Frank Karsten mana base methodology</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">EDHREC Commander data</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Scryfall + MTG Comprehensive Rules</span>
  </div>

  <!-- ═══ WHAT YOUR AI KNOWS ═══ -->
  <MarketingSection
    id="tools"
    eyebrow="EXPERT MODULES"
    title="Real data for every format."
    subtitle="Every answer comes from real card data and published methodology."
    treatment="tinted"
  >
    <div class="modules-grid">
      {#each referenceModules as mod (mod.name)}
        <div class="module-card">
          <div class="module-title-row">
            <h3 class="module-name">{mod.name}</h3>
            <ModuleBadge requiresSave={mod.requires_save} />
          </div>
          <p class="module-desc">{mod.description}</p>
        </div>
      {/each}
    </div>
  </MarketingSection>

  <!-- ═══ BEFORE / AFTER ═══ -->
  <MarketingSection eyebrow="THE DIFFERENCE" title="What changes" treatment="bleed">
    <!-- Standard / Arena pair -->
    <div class="compare-grid">
      <div class="compare-card compare-without">
        <div class="compare-header compare-header-without">
          <span class="compare-dot compare-dot-red"></span>
          WITHOUT SAVECRAFT
        </div>
        <div class="compare-body">
          {#each withoutStandard as msg (msg.role)}
            <div
              class="without-msg"
              class:without-player={msg.role === "player"}
              class:without-ai={msg.role === "ai"}
            >
              <span class="without-role">{msg.role === "player" ? "YOU" : "AI"}</span>
              <span class="without-text">{msg.text}</span>
            </div>
          {/each}
        </div>
        <p class="compare-caption compare-caption-bad">{standardCaptions.without}</p>
      </div>

      <div class="compare-card compare-with">
        <ConversationDemo
          conversation={withStandard}
          headerLabel={standardHeaderLabel}
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">{standardCaptions.with}</p>
      </div>
    </div>

    <!-- Commander pair -->
    <div class="compare-grid compare-grid-second">
      <div class="compare-card compare-without">
        <div class="compare-header compare-header-without">
          <span class="compare-dot compare-dot-red"></span>
          WITHOUT SAVECRAFT
        </div>
        <div class="compare-body">
          {#each withoutCommander as msg (msg.role)}
            <div
              class="without-msg"
              class:without-player={msg.role === "player"}
              class:without-ai={msg.role === "ai"}
            >
              <span class="without-role">{msg.role === "player" ? "YOU" : "AI"}</span>
              <span class="without-text">{msg.text}</span>
            </div>
          {/each}
        </div>
        <p class="compare-caption compare-caption-bad">Vague advice. Nothing specific.</p>
      </div>

      <div class="compare-card compare-with">
        <ConversationDemo
          conversation={withCommander}
          headerLabel="COMMANDER -- ATRAXA DECK REVIEW"
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">
          EDHREC aggregate data. Specific staples you're missing.
        </p>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ COACHING MODES ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Coaches the game you're playing"
    subtitle="Draft, Constructed, or Commander -- the coaching follows your format."
    treatment="plain"
  >
    <div class="modes-grid">
      <!-- Facts verified 2026-06-10 against Savecraft's own modules: card_stats
        (FDN: Liliana, Dreadhorde General 64.1% GIH WR, Elenda, Saint of Dusk
        61.5%; TMT: Raphael, Tough Turtle 55.2% vs 56.6% set avg, WR IWD -2.4pp;
        Everything Pizza 63.4%, IWD +10.7pp), card_search (Liliana costs 4BB),
        commander_lookup (Korvold 19,882 decks; Dark Ritual synergy +25pp,
        Ignoble Hierarch 64%, Sakura-Tribe Elder 48% inclusion). -->
      <ModeCard
        icon="*"
        label="DRAFT COACH"
        color="var(--color-gold)"
        examples={[
          {
            role: "player",
            text: "P2P1 -- Liliana or Elenda? Liliana's the bomb but I'm UW with one black source.",
          },
          {
            role: "ai",
            text: "Liliana. She beats Elenda 64.1% to 61.5% GIH WR and usually goes first pick. Double black on one source is fixable at pick 15: take the bomb, then grab black fixing over your next few picks.",
          },
        ]}
      />
      <ModeCard
        icon="+"
        label="DECK DOCTOR"
        color="var(--color-green)"
        examples={[
          {
            role: "player",
            text: "I have 24 playables in WR. Need to cut 1.",
          },
          {
            role: "ai",
            text: "Cut Raphael, Tough Turtle. I know, he looks cool -- but he wins 55.2% of games in hand against a 56.6% set average, and in WR decks drawing him costs you 2.4 points of win rate. Everything Pizza is in your pool at 63.4% GIH WR, +10.7 points when you draw it. Run the pizza.",
          },
        ]}
      />
      <ModeCard
        icon="o"
        label="COMMANDER ADVISOR"
        color="var(--color-blue)"
        examples={[
          {
            role: "player",
            text: "Building Korvold -- what does everyone else run that I'm not?",
          },
          {
            role: "ai",
            text: "Out of 19,882 Korvold decks on EDHREC, the most-played card you're missing is Ignoble Hierarch (64%). The highest-synergy one is Dark Ritual -- it shows up 25 points more often in Korvold lists than in other Jund decks. And Sakura-Tribe Elder, sac fodder that replaces itself, is in nearly half of all lists.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ HOW IT WORKS ═══ -->
  <MarketingSection
    eyebrow="HOW IT WORKS"
    title="Add Magic."
    subtitle="Reference data answers immediately. Arena players get their live game state too."
    treatment="tinted"
  >
    <div class="method-grid">
      <div class="method-item">
        <span class="method-source">Reference, immediately</span>
        <span class="method-desc">
          Add the game and every format comes online -- EDHREC staples for Commander, 17Lands stats
          for Limited, Karsten's math for mana bases, plus the full Comprehensive Rules behind
          everything.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">Your live Arena game</span>
        <span class="method-desc">
          Add Magic on the machine you play Arena on, and Savecraft walks you through pairing it
          once. It reads MTGA's Player.log in place -- the log stays on your device, only parsed
          state goes up. From that, your AI can coach a live draft, audit your Constructed list
          against winning archetypes, or quote the wildcard cost of a swap before you spend it.
          Caveats: turn on Arena's Detailed Logs first; the log resets when Arena restarts; and
          Arena never writes your card collection to it, so ownership is the one thing Savecraft
          can't see.
        </span>
      </div>
    </div>
    <div class="cta-actions" style="margin-top: 28px;">
      <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">CONNECT CLAUDE OR CHATGPT</a>
    </div>
  </MarketingSection>

  <!-- ═══ METHODOLOGY ═══ -->
  <MarketingSection
    eyebrow="METHODOLOGY"
    title="We show our work"
    subtitle="The same sources serious Magic players already trust."
    treatment="plain"
  >
    <div class="method-grid">
      <div class="method-item">
        <span class="method-source">17Lands</span>
        <span class="method-desc">
          Per-card win rates across all 31 color archetypes -- mono through five-color -- plus
          synergy matrices and draft signal data from millions of real Arena games. Bayesian
          shrinkage ensures sparse archetypes blend toward the overall mean instead of producing
          noisy recommendations. Licensed CC BY 4.0.
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
        <span class="method-source">EDHREC</span>
        <span class="method-desc">
          Aggregate Commander deck data from thousands of commanders: per-commander recommendations
          (staples, themes, High Synergy cards) and average decklists, filterable by color-identity
          subset.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">WASPAS</span>
        <span class="method-desc">
          Weighted Aggregated Sum Product Assessment -- a multi-criteria decision method that blends
          8 scoring axes with pick-adaptive weights across all 31 archetype candidates,
          format-adjusted by empirical win rate so the system naturally steers toward stronger
          archetypes. Early picks favor baseline power; late picks favor synergy and castability.
          Sigmoid-calibrated from each set's empirical distribution.
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
      <h2 class="cta-title">Give your AI the real data.</h2>
      <p class="cta-sub">
        Connect Claude or ChatGPT, add Magic, and your AI stops inventing cards.
      </p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large"
          >CONNECT CLAUDE OR CHATGPT</a
        >
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
    padding: 140px 0 60px;
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

  .module-title-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .module-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: 0.5px;
  }

  .module-desc {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  /* ── Before / After ─────────────────────────────────── */
  .compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 32px;
  }

  .compare-grid-second {
    margin-top: 20px;
  }

  .compare-card {
    border-radius: 4px;
    overflow: hidden;
  }

  .compare-without {
    background: rgba(20, 15, 25, 0.6);
    border: 1px solid rgba(180, 60, 60, 0.25);
  }

  .compare-with {
    display: flex;
    flex-direction: column;
  }

  .compare-header-without {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    color: rgba(220, 100, 100, 0.8);
    background: rgba(180, 60, 60, 0.08);
    border-bottom: 1px solid rgba(180, 60, 60, 0.15);
  }

  .compare-dot-red {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(220, 100, 100, 0.7);
  }

  .compare-body {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
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
  }

  .without-player .without-role {
    color: var(--color-text-muted);
  }

  .without-ai .without-role {
    color: rgba(180, 100, 100, 0.6);
  }

  .without-text {
    font-family: var(--font-body);
    font-size: 20px;
    line-height: 1.35;
    color: var(--color-text-dim);
  }

  .without-ai .without-text {
    color: rgba(200, 180, 150, 0.5);
  }

  .compare-caption {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    padding: 12px 14px;
    margin: 0;
  }

  .compare-caption-bad {
    color: rgba(220, 100, 100, 0.7);
    background: rgba(180, 60, 60, 0.06);
    border-top: 1px solid rgba(180, 60, 60, 0.12);
  }

  .compare-caption-good {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.06);
    border-top: 1px solid rgba(90, 190, 138, 0.12);
    margin-top: auto;
  }

  /* ── Modes ───────────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
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
    font-size: clamp(18px, 2.5vw, 26px);
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
    .hero {
      padding: 100px 0 40px;
    }

    .modules-grid {
      grid-template-columns: 1fr;
    }

    .compare-grid {
      grid-template-columns: 1fr;
    }

    .modes-grid {
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
