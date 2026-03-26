<!--
  @component
  Marketing homepage — public landing page for savecraft.gg
-->
<script lang="ts">
  import { PUBLIC_APP_URL, PUBLIC_INSTALL_URL } from "$env/static/public";
  import type { GameInfo } from "$lib/server/plugins";
  import {
    ConversationDemo,
    MarketingSection,
    ModeCard,
    ParticleField,
  } from "$lib/components/marketing";
  import type { DemoMessage } from "$lib/components/marketing/types";
  import { onMount } from "svelte";

  let { data } = $props<{ data: { availableGames: GameInfo[] } }>();

  // ── Conversation demo data ─────────────────────────────────
  const conversation: DemoMessage[] = [
    { role: "player", text: "I gave Alex the Mermaid's Pendant... HE SAID YES!!!" },
    {
      role: "ai",
      text: "Congratulations!! He moves in after the ceremony on the 28th. Fair warning — he still talks about gridball. A lot.",
    },
    { role: "player", text: "Ha, worth it. What should I focus on this season?" },
    {
      role: "ai",
      text: "You're at 63% Perfection in Fall Year 3. You're still missing Red Cabbage for the Community Center — check the Traveling Cart on Fridays. Plant Cranberries on every open tile for the gold you'll need for the Obelisks.",
    },
  ];

  // ── Games data ───────────────────────────────────────────────
  interface HomeGame {
    name: string;
    status: string;
    color: string;
    iconHtml?: string;
    iconText?: string;
  }

  const plannedGames: HomeGame[] = [
    { name: "Path of Exile 2", status: "COMING SOON", color: "#c8a84e", iconText: "P2" },
    { name: "Baldur's Gate 3", status: "PLANNED", color: "#4a9aea", iconText: "BG" },
  ];

  const games: HomeGame[] = $derived([
    ...data.availableGames.map((g: GameInfo) => ({
      name: g.name,
      status: "AVAILABLE" as const,
      color: "#5abe8a",
      iconHtml: g.iconHtml,
    })),
    ...plannedGames,
  ]);

  // ── OS detection for install commands ──────────────────
  let isWindows = $state(false);

  onMount(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform: string } };
    const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
    isWindows = /win/i.test(platform);
  });
</script>

<svelte:head>
  <title>Savecraft — Your AI already knows your build</title>
  <meta
    name="description"
    content="Savecraft gives AI assistants access to your actual game state - characters, gear, skills, progress. Real data from your save files, updated live."
  />
</svelte:head>

<div class="page">
  <!-- ═══ HERO AREA ═══ -->
  <div class="hero-bg">
    <ParticleField />

    <!-- ═══ HERO ═══ -->
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-text">
          <div class="hero-eyebrow">REAL-TIME GAME STATE FOR AI</div>
          <h1 class="hero-title">
            Your AI already<br />knows your build.
          </h1>
          <p class="hero-sub">
            Savecraft connects your AI to your actual game state — gear, skills, quests, progress.
            Not screenshots. Not memory. Real data, updated live.
          </p>
          <div class="hero-actions">
            <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold">START YOUR JOURNEY</a>
            <a href="#how" class="btn-outline">SEE HOW IT WORKS</a>
          </div>
        </div>

        <!-- Conversation demo -->
        <ConversationDemo {conversation} headerLabel="STARDEW VALLEY — SUNRISE FARM, YEAR 3" />
      </div>
    </section>
  </div>
  <!-- /hero-bg -->

  <!-- ═══ SOCIAL PROOF LINE (divider between hero and content) ═══ -->
  <div class="proof-bar">
    <span class="proof-item">Works with Claude and ChatGPT</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Open source daemon</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Read-only — can never modify your saves</span>
  </div>

  <!-- ═══ HOW IT WORKS ═══ -->
  <MarketingSection id="how" eyebrow="HOW IT WORKS" title="Three steps. Zero config.">
    <div class="steps-grid">
      <div class="step-card">
        <div class="step-num">01</div>
        <div class="step-icon" style="color: var(--color-green);">></div>
        <h3 class="step-name">INSTALL</h3>
        <p class="step-desc">
          A background daemon watches your save files. Runs on PC, Mac, Steam Deck. One command,
          zero config.
        </p>
        {#if isWindows}
          <a href={PUBLIC_INSTALL_URL} class="step-code step-link" target="_blank" rel="noopener"
            >Download for Windows</a
          >
        {:else}
          <code class="step-code">curl -sSL {PUBLIC_INSTALL_URL} | bash</code>
        {/if}
      </div>
      <div class="step-card">
        <div class="step-num">02</div>
        <div class="step-icon" style="color: var(--color-blue);">{"{ }"}</div>
        <h3 class="step-name">PARSE</h3>
        <p class="step-desc">
          Plugins read your save files and extract the good stuff — gear, skills, progress, items.
          They're sandboxed and can't touch anything else on your machine.
        </p>
      </div>
      <div class="step-card">
        <div class="step-num">03</div>
        <div class="step-icon" style="color: var(--color-gold);">?</div>
        <h3 class="step-name">ASK</h3>
        <p class="step-desc">
          Connect Claude or ChatGPT. Your AI reads your actual game state and gives answers grounded
          in real data — not hallucinated guesses.
        </p>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ DUAL MODE ═══ -->
  <MarketingSection
    eyebrow="HOW YOU USE IT"
    title="Companion and optimizer"
    subtitle="Your AI reads the same game state either way. You decide where it goes."
  >
    <div class="modes-grid">
      <ModeCard
        icon="~"
        label="COMPANION"
        color="var(--color-green)"
        examples={[
          {
            role: "player",
            text: "ANOTHER Countess run and ZERO RUNES. I'm losing it.",
          },
          {
            role: "ai",
            text: "23 runs tracked. She only drops up to Io in Hell though — if you need Shaels, Normal Countess is actually better odds. Your Sorc clears it in 40 seconds. Want to switch it up?",
          },
        ]}
      />
      <ModeCard
        icon="="
        label="OPTIMIZER"
        color="var(--color-blue)"
        examples={[
          { role: "player", text: "Am I hitting my FCR breakpoint?" },
          {
            role: "ai",
            text: "You're at 75% FCR — one breakpoint short of 125%. Swapping your Spirit shield for a 35% FCR one would get you there. Or craft a 20% amulet to keep the resistances.",
          },
        ]}
      />
    </div>
  </MarketingSection>

  <!-- ═══ GAMES ═══ -->
  <MarketingSection id="games" eyebrow="GAMES" title="Growing library">
    <div class="games-grid">
      {#each games as game (game.name)}
        <div class="game-card">
          <span class="game-icon">
            {#if game.iconHtml}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- Icon from build-time plugin manifest, not user input -->
              {@html game.iconHtml}
            {:else}
              {game.iconText}
            {/if}
          </span>
          <div class="game-info">
            <span class="game-name">{game.name}</span>
          </div>
          <span
            class="game-status"
            style="color: {game.color}; border-color: {game.color}40; background: {game.color}10;"
          >
            {game.status}
          </span>
        </div>
      {/each}
    </div>

    <p class="games-note">
      Savecraft is open source. Know a game we should support?
      <a
        href="https://github.com/joshsymonds/savecraft.gg"
        class="text-link"
        target="_blank"
        rel="noopener">Contribute a plugin</a
      >
    </p>
  </MarketingSection>

  <!-- ═══ SECURITY ═══ -->
  <MarketingSection
    eyebrow="SECURITY"
    title="Your data stays yours"
    eyebrowColor="var(--color-green)"
  >
    <div class="security-grid">
      <div class="security-item">
        <span class="security-check">+</span>
        <div>
          <span class="security-label">Fully Sandboxed</span>
          <span class="security-desc"
            >Plugins are isolated in a sandbox. They can read your save file and nothing else — no
            filesystem access, no network access, no exceptions.</span
          >
        </div>
      </div>
      <div class="security-item">
        <span class="security-check">+</span>
        <div>
          <span class="security-label">Tamper-Proof Plugins</span>
          <span class="security-desc"
            >Every plugin is cryptographically signed and verified before it runs. If anything's
            been modified, it won't load.</span
          >
        </div>
      </div>
      <div class="security-item">
        <span class="security-check">+</span>
        <div>
          <span class="security-label">Read-Only by Design</span>
          <span class="security-desc"
            >Savecraft can never modify your save files. It watches and reads, that's it. Open
            source — inspect it yourself.</span
          >
        </div>
      </div>
      <div class="security-item">
        <span class="security-check">+</span>
        <div>
          <span class="security-label">AI Sees Data, Not Files</span>
          <span class="security-desc"
            >Your AI gets game state — items, skills, progress — never your local files or folder
            paths.</span
          >
        </div>
      </div>
    </div>
  </MarketingSection>

  <!-- ═══ COMMUNITY ═══ -->
  <MarketingSection
    eyebrow="COMMUNITY"
    title="Built in the open"
    subtitle="Most feature decisions start in Discord. Request a game, report a bug, or share a build."
  >
    <div class="community-grid">
      <a href="https://discord.gg/YnC8stpEmF" class="community-card" target="_blank" rel="noopener">
        <div class="community-icon discord-icon">
          <svg width="28" height="22" viewBox="0 0 71 55" fill="currentColor"
            ><path
              d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9 .2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1 58.7 58.7 0 0017.7-9 .2.2 0 00.1-.2c1.4-15-2.3-28.4-9.8-40.1a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1zm23.3 0c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.7 7.1-6.3 7.1z"
            /></svg
          >
        </div>
        <div class="community-info">
          <span class="community-name">Discord</span>
          <span class="community-desc">Chat with the community, request games, share builds</span>
        </div>
        <span class="community-arrow">&rarr;</span>
      </a>

      <a
        href="https://github.com/joshsymonds/savecraft.gg"
        class="community-card"
        target="_blank"
        rel="noopener"
      >
        <div class="community-icon github-icon">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor"
            ><path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            /></svg
          >
        </div>
        <div class="community-info">
          <span class="community-name">GitHub</span>
          <span class="community-desc">Read the source, open issues, contribute plugins</span>
        </div>
        <span class="community-arrow">&rarr;</span>
      </a>
    </div>
  </MarketingSection>

  <!-- ═══ CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">Ready for Player 2?</h2>
      <p class="cta-sub">Install in 30 seconds. Works with Claude and ChatGPT.</p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-in`} class="btn-gold btn-large">GET STARTED</a>
      </div>
      <div class="cta-install">
        {#if isWindows}
          <a
            href={PUBLIC_INSTALL_URL}
            class="install-code install-link"
            target="_blank"
            rel="noopener">Download for Windows</a
          >
        {:else}
          <code class="install-code">curl -sSL {PUBLIC_INSTALL_URL} | bash</code>
        {/if}
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

  /* ── Hero background + particles ──────────────────────── */
  .hero-bg {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 25% 15%, rgba(20, 10, 60, 0.5) 0%, transparent 50%),
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

  /* ── Steps ───────────────────────────────────────────── */
  .steps-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 40px;
  }

  .step-card {
    padding: 28px 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    transition: border-color 0.3s;
  }

  .step-card:hover {
    border-color: var(--color-border-light);
  }

  .step-num {
    font-family: var(--font-heading);
    font-size: 36px;
    font-weight: 700;
    color: var(--color-border);
    opacity: 0.2;
    margin-bottom: 16px;
  }

  .step-icon {
    font-family: var(--font-heading);
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 16px;
  }

  .step-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .step-desc {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  .step-code {
    display: block;
    margin-top: 14px;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-green);
    background: rgba(5, 7, 26, 0.6);
    padding: 8px 12px;
    border-radius: 3px;
    border: 1px solid rgba(90, 190, 138, 0.15);
  }

  .step-link {
    text-decoration: none;
    cursor: pointer;
  }

  .step-link:hover {
    color: var(--color-gold);
    border-color: rgba(200, 168, 78, 0.3);
  }

  /* ── Modes ───────────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  /* ── Games ───────────────────────────────────────────── */
  .games-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 32px;
  }

  .game-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    transition: border-color 0.3s;
  }

  .game-card:hover {
    border-color: var(--color-border-light);
  }

  .game-icon {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-gold-light);
    min-width: 32px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .game-icon :global(img) {
    width: 24px;
    height: 24px;
    border-radius: 2px;
  }

  .game-icon :global(svg) {
    width: 24px;
    height: 24px;
  }

  .game-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .game-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.3;
  }

  .game-status {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 2px;
    border: 1px solid;
    letter-spacing: 1px;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .games-note {
    margin-top: 24px;
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  .text-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .text-link:hover {
    border-color: var(--color-gold);
  }

  /* ── Security ────────────────────────────────────────── */
  .security-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 32px;
  }

  .security-item {
    display: flex;
    gap: 12px;
  }

  .security-check {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-green);
    flex-shrink: 0;
    padding-top: 1px;
  }

  .security-label {
    display: block;
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-green);
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .security-desc {
    display: block;
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  /* ── Community ──────────────────────────────────────────── */
  .community-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .community-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 22px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    text-decoration: none;
    transition:
      border-color 0.3s,
      transform 0.2s;
  }

  .community-card:hover {
    border-color: var(--color-border-light);
    transform: translateY(-2px);
  }

  .community-icon {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }

  .discord-icon {
    color: #5865f2;
    background: rgba(88, 101, 242, 0.1);
  }

  .github-icon {
    color: var(--color-text);
    background: rgba(232, 224, 208, 0.08);
  }

  .community-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .community-name {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
  }

  .community-desc {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
  }

  .community-arrow {
    font-size: 20px;
    color: var(--color-text-muted);
    transition:
      color 0.2s,
      transform 0.2s;
  }

  .community-card:hover .community-arrow {
    color: var(--color-gold);
    transform: translateX(3px);
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

  .cta-install {
    display: inline-block;
    padding: 12px 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .install-code {
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-green);
  }

  .install-link {
    text-decoration: none;
    cursor: pointer;
  }

  .install-link:hover {
    color: var(--color-gold);
  }

  /* ── Responsive ──────────────────────────────────────── */
  @media (max-width: 900px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 32px;
    }

    .steps-grid {
      grid-template-columns: 1fr;
    }

    .modes-grid {
      grid-template-columns: 1fr;
    }

    .games-grid {
      grid-template-columns: 1fr 1fr;
    }

    .security-grid {
      grid-template-columns: 1fr;
    }

    .community-grid {
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

    .games-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
