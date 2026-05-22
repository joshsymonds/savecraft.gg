<!--
  @component
  Path of Exile landing page -- headless Path of Building in chat, plus
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
      alt: "Claude swapping Void Manipulation for Concentrated Effect in a PoE build -- before/after table showing +766k DPS (+14.7%) with real Path of Building calc deltas",
    },
    {
      src: "/images/poe/poe2.jpg",
      alt: "Hierophant Level 94 Templar build analysis -- 5.22M DPS, 20.9k Life, resistances, offense stats, socket groups rendered from pob-server",
    },
    {
      src: "/images/poe/poe2.jpg",
      alt: "Path of Building analysis of a Level 94 Hierophant in chat -- 5.22M DPS, 20.9k Life, full resistances and socket groups, no copy-paste",
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
  <title>Path of Exile -- Build Planner for Claude & ChatGPT | Savecraft</title>
  <meta
    name="description"
    content="Savecraft is GGG-approved. Link your Path of Exile account and your AI runs your live characters through the real Path of Building calc engine -- or paste a pobb.in link. Real DPS deltas and live poe.ninja prices for budget upgrades."
  />
  <meta property="og:title" content="Savecraft -- Path of Building in Chat" />
  <meta
    property="og:description"
    content="GGG-approved account connect: your AI reads your live PoE characters and runs them through real Path of Building. Or paste a pobb.in link. Real DPS deltas plus live poe.ninja prices."
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
        title="Real DPS deltas, real tree math, your actual build."
        subtitle="Savecraft is GGG-approved. Link your account or paste a pobb.in link, and your AI calls the real Path of Building calc engine on your build. Live poe.ninja prices come in too."
        actions={heroActions}
        frames={heroFrames}
      />
    </section>
  </div>

  {#snippet heroActions()}
    <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">CONNECT YOUR ACCOUNT</a>
    <a href="#tools" class="btn-outline">SEE THE TOOLS</a>
  {/snippet}

  <!-- ═══ CREDIBILITY BAR ═══ -->
  <div class="proof-bar">
    <span class="proof-item">GGG-approved connected app</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Path of Building calc engine</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">poe.ninja live economy</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">RePoE -- gems, uniques, mods, tree</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">GGG passive tree export</span>
  </div>

  <!-- ═══ ACCOUNT CONNECT ═══ -->
  <MarketingSection
    eyebrow="NEW -- GGG-APPROVED ACCOUNT CONNECT"
    title="Connect your account, or paste a link."
    subtitle="Savecraft is a GGG-approved connecting application. Every DPS number comes from Path of Building itself -- Savecraft ferries the build to the calc engine and the result back."
  >
    <div class="method-grid">
      <div class="method-item">
        <span class="method-source">Connect your account</span>
        <span class="method-desc">
          Link your Path of Exile account once, through GGG's official OAuth -- read-only, character
          data only. Every non-deleted character is imported: gear, the full passive tree, jewels
          (cluster jewels included), skill links. Then you ask your AI about your own characters by
          name -- "where is my Champion losing the most damage?"
        </span>
      </div>
      <div class="method-item">
        <span class="method-source">Or paste a link</span>
        <span class="method-desc">
          Not your build, or not connected? Drop a pobb.in, pastebin, maxroll, poe.ninja, rentry,
          or poedb URL and it runs through the same headless Path of Building. Compare your live
          character against a guide's link in a single request.
        </span>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ REFERENCE TOOLS ═══ -->
  <MarketingSection
    id="tools"
    eyebrow="EXPERT MODULES"
    title="Real data for every build."
    subtitle="Every answer is grounded in PoB's actual calc engine, current RePoE data, and live poe.ninja prices."
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
          headerLabel="GEM SWAP -- REAL CALC DELTA"
          headerDotColor="var(--color-green)"
          startDelay={800}
        />
        <p class="compare-caption compare-caption-good">
          Real PoB calc on your actual build, with the cheaper alternative priced too.
        </p>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ COACHING MODES ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Coaches your build at every stage"
    subtitle="The right calc for whichever side of the build you're on."
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
            text: "Audit my passive tree -- what's underperforming?",
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
            text: "Three options in budget. Taste of Hate (14 div) -- +12% DPS via freeze + chaos conversion. Headhunter jewel slot mods (22 div for T1) -- flex utility. A +1 to all gems amulet (28 div) -- +6% DPS, +4% max resists. Taste of Hate wins DPS/div.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ HOW IT WORKS ═══ -->
  <MarketingSection
    eyebrow="FROM URL TO DPS"
    title="Connect or paste. Get real answers."
    subtitle="Path of Exile is a server-side game. Connect your account and Savecraft reads your live characters straight from GGG -- or hand it a build link. Either way, the build runs through real Path of Building on our infrastructure."
  >
    <div class="flow-grid">
      <div class="flow-step">
        <div class="flow-num">1</div>
        <div class="flow-body">
          <h3 class="flow-title">Connect your account or paste a link</h3>
          <p class="flow-desc">
            Connect once via GGG's official OAuth and every character is available by name -- or
            drop a pobb.in, pastebin, maxroll, poe.ninja, rentry, or poedb URL. Your AI calls the
            build_planner tool either way.
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
            Ask your AI to swap a gem, change a passive, or scan the nearby tree for the biggest
            impact node. Each modification returns a new buildId, so you can branch hypotheses and
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
    subtitle="The same sources serious PoE players already trust."
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
          The community-maintained extraction of PoE's game data -- gems, uniques, mods, base items,
          stat translations -- updated per patch. Indexed into D1 with FTS5 full-text search and
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
      <p class="cta-sub">
        Works with Claude and ChatGPT. Connect your account or paste a link.
      </p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large">CONNECT YOUR ACCOUNT</a>
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
