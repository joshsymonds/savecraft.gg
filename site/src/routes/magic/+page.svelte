<!--
  @component
  Magic: The Gathering landing page — all-format reference tools (Commander, Standard,
  draft, Legacy) plus Arena-specific coaching when the daemon is connected.
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
  import type { DemoMessage } from "$lib/components/marketing/types";
  import type { GameInfo, ReferenceModule } from "$lib/server/plugins";

  let { data } = $props<{ data: { game: GameInfo } }>();

  const heroFrames = [
    {
      src: "/images/magic/magic-good.jpeg",
      alt: "Claude reviewing a Magic TMNT draft — user asks 'how did I do?', Claude pulls draft history and renders a 14/12/3/12 Optimal/Good/Questionable/Miss review with a pick timeline filtered by outcome",
    },
    {
      src: "/images/magic/rocks.jpg",
      alt: "Claude recommending 3-CMC mana rocks for Commander — tabbed grid of Eye / Heart / Horn / Skull / Tooth of Ramos colored by mana identity",
    },
    {
      src: "/images/magic/lifelink.jpg",
      alt: "Claude listing every white lifelink creature 2 mana or less — framed card grid with rarity chips and abilities",
    },
  ];

  let referenceModules = $derived(data.game.referenceModules);
  let instantModules = $derived(referenceModules.filter((m: ReferenceModule) => !m.requires_save));

  // ── Before/After demo data ─────────────────────────────────
  const withoutStandard = [
    { role: "player" as const, text: "Should I craft Sheoldred for my mono-black deck?" },
    {
      role: "ai" as const,
      text: "Sheoldred, the Apocalypse is a strong card in Standard. At 2BB, she provides card draw and life drain. Definitely worth crafting for mono-black.",
    },
  ];

  const withStandard: DemoMessage[] = [
    { role: "player", text: "Should I craft Sheoldred for my mono-black deck?" },
    {
      role: "ai",
      text: "Can't — Sheoldred rotated with Dominaria United, she's not Standard-legal. But Archfiend of the Dross does the same job in your list at 58.2% GIH WR. You're missing 2 copies, that's 2 rare wildcards. You have 4 in the bank.",
    },
  ];

  const withoutCommander = [
    { role: "player" as const, text: "Is my Atraxa superfriends deck missing anything?" },
    {
      role: "ai" as const,
      text: "Your Atraxa deck looks solid — lots of options for improvement depending on your playstyle. I'd suggest adding more planeswalkers and counters synergy.",
    },
  ];

  const withCommander: DemoMessage[] = [
    { role: "player", text: "Is my Atraxa superfriends deck missing anything?" },
    {
      role: "ai",
      text: "58% overlap with EDHREC's Atraxa build. Missing 3 high-inclusion staples: Anointed Procession, Smothering Tithe, Doubling Season (all above 40% inclusion). Your 4 extras are off-meta but thematic. Combo search finds 2 infinite lines involving Atraxa + The Chain Veil — neither in your list.",
    },
  ];
</script>

<svelte:head>
  <title>Magic: The Gathering — Real Data for Your AI | Savecraft</title>
  <meta
    name="description"
    content="Savecraft gives Claude and ChatGPT all-format Magic reference — Commander, Standard, draft, Legacy — plus your Arena data when you connect the daemon. 17Lands stats, EDHREC Commander data, Frank Karsten's mana math, and the full MTG Comprehensive Rules."
  />
  <meta property="og:title" content="Savecraft — Real MTG Data for Claude and ChatGPT" />
  <meta
    property="og:description"
    content="All-format Magic reference — EDHREC Commander data, 17Lands draft stats across 31 color archetypes, Frank Karsten's mana math, and the full MTG rules. Plus your Arena rank, match history, and draft picks when you connect the daemon."
  />
  <meta property="og:url" content="https://savecraft.gg/magic" />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="page">
  <!-- ═══ HERO ═══ -->
  <div class="hero-bg">
    <ParticleField seed={137} />

    <section class="hero">
      <HeroScreenshots
        variant="solo-peek"
        accent="gold"
        eyebrow="REAL DATA FOR MAGIC: THE GATHERING"
        title="Your AI stops inventing cards here."
        subtitle="All-format reference — Commander, Standard, draft, Legacy. EDHREC combos, 17Lands stats, Frank Karsten's mana math, and the full MTG rules. Plus your Arena data when you connect the daemon."
        actions={heroActions}
        frames={heroFrames}
      />
    </section>
  </div>

  {#snippet heroActions()}
    <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">TRY THE REFERENCE TOOLS</a>
    <a href="#tiers" class="btn-outline">CONNECT YOUR ARENA DATA</a>
  {/snippet}

  <!-- ═══ CREDIBILITY BAR ═══ -->
  <div class="proof-bar">
    <span class="proof-item">17Lands data across 31 color archetypes</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Frank Karsten mana base methodology</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">EDHREC Commander data + combos</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Scryfall + MTG Comprehensive Rules</span>
  </div>

  <!-- ═══ WHAT YOUR AI KNOWS ═══ -->
  <MarketingSection
    id="tools"
    eyebrow="REFERENCE TOOLS"
    title="Real data for every format."
    subtitle="Every answer is grounded in real card data, real match statistics, and published methodology. No hallucinated cards. No invented abilities."
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
  <MarketingSection eyebrow="THE DIFFERENCE" title="What changes">
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
        <p class="compare-caption compare-caption-bad">
          Sheoldred rotated out of Standard 6 months ago.
        </p>
      </div>

      <div class="compare-card compare-with">
        <ConversationDemo
          conversation={withStandard}
          headerLabel="STANDARD — MONO-BLACK WILDCARDS"
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">
          Current format. Real win rates. Your actual wildcards.
        </p>
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
        <p class="compare-caption compare-caption-bad">
          Vague advice. No staple detection. No combo awareness.
        </p>
      </div>

      <div class="compare-card compare-with">
        <ConversationDemo
          conversation={withCommander}
          headerLabel="COMMANDER — ATRAXA DECK REVIEW"
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">
          EDHREC aggregate data. Specific staples. Real combo lines.
        </p>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ COACHING MODES ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Three coaching modes"
    subtitle="Same grounded data, three ways to use it. Draft with you live, audit your Constructed build, or dial in your Commander deck."
  >
    <div class="modes-grid">
      <ModeCard
        icon="*"
        label="DRAFT COACH"
        color="var(--color-gold)"
        examples={[
          {
            role: "player",
            text: "P2P1 — Liliana or Elenda? Liliana's the bomb but I'm UW with one black source.",
          },
          {
            role: "ai",
            text: "Liliana. 63.6% GIH WR vs Elenda's 60.3% — that gap is too large to leave on the table at pick 15. Your archetype confidence is only 0.16, so pivoting to UB or Esper is wide open. The pivot model estimates ~5.4 acquirable black sources over 28 remaining picks. Prioritize black fixing next 3-4 picks.",
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
            text: "Cut Raphael, Tough Turtle. I know, he looks cool — but 52.3% GIH WR and your pool only has 5 red sources for his RR cost. Karsten says you need 8 for on-curve. You're also short on removal (2 pieces vs the 4.6 winning decks average). Everything Pizza does more for this deck.",
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
            text: "Building Korvold — what combos should I include?",
          },
          {
            role: "ai",
            text: "Korvold has 12 popular combo lines on EDHREC, 4 with bracket score 4 (fast). Top-ranked: Dockside Extortionist + Temur Sabertooth (infinite mana, 3 pieces, 34% of Korvold decks run it). Food Chain + Squee combos out 2 separate lines. Your RBG identity supports all of them.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ TWO-TIER CTA ═══ -->
  <MarketingSection
    id="tiers"
    eyebrow="CONNECT"
    title="Two ways in"
    subtitle="All-format reference works immediately. Install the daemon to unlock your Arena rank, match history, and live draft coaching."
  >
    <div class="tiers-grid">
      <div class="tier-card">
        <div class="tier-header tier-instant">
          <span class="tier-label">TRY IT NOW</span>
          <span class="tier-badge">NO INSTALL</span>
        </div>
        <div class="tier-body">
          <p class="tier-desc">
            Connect Savecraft to Claude or ChatGPT. All-format reference tools work immediately — no
            install required:
          </p>
          <ul class="tier-features">
            {#each instantModules as mod (mod.name)}
              <li>{mod.name}</li>
            {/each}
          </ul>
          <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold tier-cta">TRY THE REFERENCE TOOLS</a
          >
        </div>
      </div>

      <div class="tier-card">
        <div class="tier-header tier-deep">
          <span class="tier-label">GO DEEPER</span>
          <span class="tier-badge">YOUR DATA</span>
        </div>
        <div class="tier-body">
          <p class="tier-desc">
            Install the Savecraft daemon to sync your MTGA Player.log. Your AI can then coach with
            your actual game state:
          </p>
          <ul class="tier-features">
            <li>Review your draft picks against optimal lines</li>
            <li>Health-check your deck vs winning archetypes</li>
            <li>Calculate wildcard cost for any decklist</li>
            <li>Track your rank, currencies, wildcards, and match history</li>
          </ul>
          <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-outline tier-cta">INSTALL THE DAEMON</a>
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
        <span class="method-source">EDHREC</span>
        <span class="method-desc">
          Aggregate Commander deck data: per-commander recommendation categories (staples, themes,
          high-synergy cards), combo lines with bracket scores, average decklists, and
          color-identity-subset filtering across thousands of unique commanders.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">WASPAS</span>
        <span class="method-desc">
          Weighted Aggregated Sum Product Assessment — a multi-criteria decision method that blends
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
      <p class="cta-sub">Connect in 30 seconds. Works with Claude and ChatGPT.</p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large">CONNECT YOUR ARENA DATA</a>
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
