<!--
  @component
  Path of Exile landing page — headless Path of Building in chat, plus
  reference modules grounded in real game data (gems, tree, uniques,
  mods, live economy).
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
  import type { GameInfo } from "$lib/server/plugins";

  let { data } = $props<{ data: { game: GameInfo } }>();

  const heroFrames = [
    {
      src: "/images/poe/poe3.jpeg",
      alt: "Claude swapping Void Manipulation for Concentrated Effect in a PoE build — before/after table showing +766k DPS (+14.7%) with real Path of Building calc deltas",
    },
    {
      src: "/images/poe/poe2.jpg",
      alt: "Hierophant Level 94 Templar build analysis — 5.22M DPS, 20.9k Life, resistances, offense stats, socket groups rendered from pob-server",
    },
    {
      src: "/images/poe/poe2.jpg",
      alt: "PoE build analysis (placeholder for a third distinct PoE product shot)",
    },
  ];

  let referenceModules = $derived(data.game.referenceModules);

  // ── Before/After demo: stale memory vs real PoB calc ─────────
  const withoutPoB: DemoMessage[] = [
    {
      role: "player",
      text: "Is Awakened Added Cold worth 40 divines over Added Cold L21 in my main link?",
    },
    {
      role: "ai",
      text: "Awakened Added Cold Support gives roughly +12% More Cold Damage over the regular version, plus it levels to 5. Probably worth it if you're min-maxing, though 40 divines is a lot.",
    },
  ];

  const withPoB: DemoMessage[] = [
    {
      role: "player",
      text: "Is Awakened Added Cold worth 40 divines over Added Cold L21 in my main link?",
    },
    {
      role: "ai",
      text: "Tested both on your pobb.in. Added Cold L21: 3.8M DPS. Awakened Added: 4.4M DPS (+15.8%). 15.8% more damage for 40 div. Worth it if you're min-maxing. Cheaper alternative: Heart of Ice cluster gives +8% for ~12 div.",
    },
  ];
</script>

<svelte:head>
  <title>Path of Exile — Build Planner for Claude | Savecraft</title>
  <meta
    name="description"
    content="Savecraft runs Path of Building's real calc engine inside your AI. Paste a pobb.in link — Claude swaps gems, tests passive nodes, audits your tree, and returns actual DPS and defensive deltas. Plus live poe.ninja prices for budget-aware upgrades."
  />
  <meta property="og:title" content="Savecraft — Path of Building in Chat" />
  <meta
    property="og:description"
    content="Paste a pobb.in link. Claude calls real Path of Building, swaps gems, tests nodes, and returns actual DPS deltas — not guesses. Anti-hallucination gem, tree, unique, and mod lookups. Live poe.ninja prices."
  />
  <meta property="og:url" content="https://savecraft.gg/poe" />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="page">
  <!-- ═══ HERO ═══ -->
  <div class="hero-bg">
    <ParticleField seed={241} />

    <section class="hero">
      <HeroScreenshots
        variant="solo-peek"
        accent="gold"
        eyebrow="PATH OF BUILDING IN CHAT"
        title="Real DPS deltas. Real tree math. Real answers."
        subtitle="Paste a pobb.in link. Claude calls the real Path of Building calc engine, swaps gems, tests nodes, and returns actual numbers — not guesses. Plus live poe.ninja prices for budget-aware upgrades."
        actions={heroActions}
        frames={heroFrames}
      />
    </section>
  </div>

  {#snippet heroActions()}
    <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">PASTE A POB LINK</a>
    <a href="#tools" class="btn-outline">SEE THE TOOLS</a>
  {/snippet}

  <!-- ═══ CREDIBILITY BAR ═══ -->
  <div class="proof-bar">
    <span class="proof-item">Path of Building calc engine</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">poe.ninja live economy</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">RePoE — gems, uniques, mods, tree</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">GGG passive tree export</span>
  </div>

  <!-- ═══ REFERENCE TOOLS ═══ -->
  <MarketingSection
    id="tools"
    eyebrow="EXPERT MODULES"
    title="Real data for every build."
    subtitle="Every answer is grounded in PoB's actual calc engine, current RePoE data, and live poe.ninja prices. No hallucinated gem effects. No made-up unique mods. No guessed DPS."
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
    <div class="compare-grid">
      <div class="compare-card compare-without">
        <div class="compare-header compare-header-without">
          <span class="compare-dot compare-dot-red"></span>
          WITHOUT SAVECRAFT
        </div>
        <div class="compare-body">
          {#each withoutPoB as msg (msg.role)}
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
          Stale memory. Ballpark numbers. No idea what your actual build looks like.
        </p>
      </div>

      <div class="compare-card compare-with">
        <ConversationDemo
          conversation={withPoB}
          headerLabel="GEM SWAP — REAL CALC DELTA"
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">
          Real PoB calc on your actual build. Exact deltas. Priced alternative considered.
        </p>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ COACHING MODES ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Three build workflows"
    subtitle="Same headless PoB engine, three ways to drive it. Analyze and iterate on a build, audit your current tree for weak branches, or scout the economy for budget upgrades."
  >
    <div class="modes-grid">
      <ModeCard
        icon="*"
        label="BUILD PLANNER"
        color="var(--color-gold)"
        examples={[
          {
            role: "player",
            text: "I'm farming maps. Is Awakened Added Cold worth 40 divines over Added Cold L21?",
          },
          {
            role: "ai",
            text: "Tested both on your pobb.in. Added Cold L21: 3.8M DPS. Awakened Added: 4.4M DPS (+15.8%). Worth it if you're min-maxing. Cheaper alternative: Heart of Ice cluster gives +8% for ~12 div.",
          },
        ]}
      />
      <ModeCard
        icon="="
        label="TREE AUDITOR"
        color="var(--color-blue)"
        examples={[
          {
            role: "player",
            text: "Audit my passive tree — what's underperforming?",
          },
          {
            role: "ai",
            text: "Weakest branch: the 6-point Resolute Technique cluster. Cutting it loses 380k DPS but frees six points. Nearby high-impact nodes: Savagery (+820k DPS, 4 points) and Heart of Flame (+310k and +200 EHP, 3 points). Swap saves 1 point and gains ~750k DPS net.",
          },
        ]}
      />
      <ModeCard
        icon="+"
        label="ECONOMY SCOUT"
        color="var(--color-green)"
        examples={[
          {
            role: "player",
            text: "I have 30 divines. Best upgrade for my build?",
          },
          {
            role: "ai",
            text: "Three options in budget. Taste of Hate (14 div) — +12% DPS via freeze + chaos conversion. Headhunter jewel slot mods (22 div for T1) — flex utility. A +1 to all gems amulet (28 div) — +6% DPS, +4% max resists. Taste of Hate wins DPS/div.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ HOW IT WORKS ═══ -->
  <MarketingSection
    eyebrow="NO INSTALL REQUIRED"
    title="Paste a link. Get real answers."
    subtitle="Path of Exile is a server-side game — your build lives on pobb.in, pastebin, or in a PoB code. Savecraft's build planner takes any of those and runs them through real Path of Building on our infrastructure. No daemon, no save-file sync, no download."
  >
    <div class="flow-grid">
      <div class="flow-step">
        <div class="flow-num">1</div>
        <div class="flow-body">
          <h3 class="flow-title">Paste your build link</h3>
          <p class="flow-desc">
            pobb.in, pastebin, maxroll, poe.ninja, rentry, poedb — all supported. Claude calls the
            build_planner tool with your URL.
          </p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-num">2</div>
        <div class="flow-body">
          <h3 class="flow-title">Savecraft runs real PoB</h3>
          <p class="flow-desc">
            Our pob-server decodes the build, loads it into a LuaJIT process running Path of
            Building Community Fork, and returns DPS, life, resists, and a permanent buildId for
            follow-up calls.
          </p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-num">3</div>
        <div class="flow-body">
          <h3 class="flow-title">Iterate in conversation</h3>
          <p class="flow-desc">
            Ask Claude to swap a gem, allocate a passive, equip a unique, or scan nearby nodes by
            impact. Each modification returns a new buildId, so you can branch hypotheses and
            compare results.
          </p>
        </div>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ METHODOLOGY ═══ -->
  <MarketingSection
    eyebrow="METHODOLOGY"
    title="We show our work"
    subtitle="Every tool is built on the real Path of Building calc engine, published community data, and live market feeds. No black boxes."
  >
    <div class="method-grid">
      <div class="method-item">
        <span class="method-source">Path of Building</span>
        <span class="method-desc">
          The Community Fork's canonical calc engine, running as a headless LuaJIT service
          (pob-server) behind Savecraft. Every DPS number, EHP calculation, and tree traversal
          matches what you'd see in PoB itself. Pinned to a specific commit so upstream changes
          don't silently shift answers.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">RePoE</span>
        <span class="method-desc">
          The community-maintained extraction of PoE's game data — gems, uniques, mods, base items,
          stat translations — updated per patch. Indexed into D1 with FTS5 full-text search and
          Vectorize embeddings for semantic lookup.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">poe.ninja</span>
        <span class="method-desc">
          Live item pricing fetched directly from the public poe.ninja API with per-isolate 1-hour
          caching and singleflight deduplication. 7-day sparklines and listing counts so you can
          tell a confident price from a thin one.
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">Content-addressed builds</span>
        <span class="method-desc">
          Every build (original or modified) is content-hashed and gets a permanent short URL at
          <code>pob.savecraft.gg/{"{id}"}</code>. Parent-child lineage tracks modifications, so you
          can branch hypotheses, compare, and share any state.
        </span>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">Give your AI the real calc.</h2>
      <p class="cta-sub">Works with Claude and ChatGPT. No install. No GGG API signup.</p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large">PASTE A POB LINK</a>
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
      radial-gradient(ellipse at 25% 15%, rgba(100, 30, 20, 0.35) 0%, transparent 50%),
      radial-gradient(ellipse at 75% 50%, rgba(80, 60, 10, 0.3) 0%, transparent 50%),
      linear-gradient(180deg, #0a0305 0%, #130510 25%, #160a22 60%, #0a0e2e 100%);
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
    transition: all 0.2s;
  }

  .btn-outline:hover {
    border-color: var(--color-gold);
    color: var(--color-gold);
  }

  .btn-large {
    font-size: 16px;
    padding: 16px 40px;
  }

  /* ── Proof bar ────────────────────────────────────────── */
  .proof-bar {
    background: rgba(5, 7, 26, 0.6);
    border-top: 1px solid rgba(74, 90, 173, 0.2);
    border-bottom: 1px solid rgba(74, 90, 173, 0.2);
    padding: 18px 32px;
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    justify-content: center;
    align-items: center;
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
    color: var(--color-gold);
    opacity: 0.6;
  }

  /* ── Modules grid ─────────────────────────────────────── */
  .modules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
  }

  .module-card {
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 20px 22px;
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
    color: var(--color-gold);
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

  /* ── Compare grid ─────────────────────────────────────── */
  .compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;
  }

  .compare-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(232, 90, 90, 0.2);
  }

  .compare-header-without {
    color: var(--color-red);
  }

  .compare-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .compare-dot-red {
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
  }

  .without-player .without-role {
    color: var(--color-green);
  }

  .without-ai .without-role {
    color: var(--color-red);
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

  /* ── Modes grid ──────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  /* ── Flow (how it works) ─────────────────────────────── */
  .flow-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .flow-step {
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }

  .flow-num {
    font-family: var(--font-pixel);
    font-size: 24px;
    color: var(--color-gold);
    min-width: 42px;
    text-align: center;
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

  /* ── Methodology grid ────────────────────────────────── */
  .method-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 28px;
  }

  .method-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 24px;
    border-left: 2px solid var(--color-gold);
    background: rgba(5, 7, 26, 0.3);
  }

  .method-source {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-gold);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .method-desc {
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.6;
    color: var(--color-text-dim);
  }

  .method-desc code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.08);
    padding: 1px 6px;
    border-radius: 2px;
  }

  /* ── Final CTA ───────────────────────────────────────── */
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
    font-size: clamp(18px, 2.4vw, 24px);
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

    .flow-grid {
      grid-template-columns: 1fr;
    }

    .method-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
