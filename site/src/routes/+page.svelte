<!--
  @component
  Marketing homepage — public landing page for savecraft.gg
-->
<script lang="ts">
  import { PUBLIC_APP_URL, PUBLIC_INSTALL_URL } from "$env/static/public";
  import { onMount } from "svelte";

  // ── Conversation demo state ──────────────────────────────────
  interface Message {
    role: "player" | "ai";
    text: string;
  }

  const conversation: Message[] = [
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

  let visibleCount = $state(0);
  let typingIndex = $state(-1);
  let typedText = $state("");
  let demoStarted = $state(false);

  // ── Scroll-triggered animations ──────────────────────────────
  let sections = $state<HTMLElement[]>([]);
  let visibleSections = $state(new Set<number>());

  // ── Games data ───────────────────────────────────────────────
  const games = [
    { name: "Diablo II: Resurrected", status: "AVAILABLE", color: "#5abe8a", icon: "II" },
    { name: "Stardew Valley", status: "COMING SOON", color: "#c8a84e", icon: "SV" },
    { name: "Path of Exile 2", status: "COMING SOON", color: "#c8a84e", icon: "P2" },
    { name: "Baldur's Gate 3", status: "PLANNED", color: "#4a9aea", icon: "BG" },
    { name: "Stellaris", status: "PLANNED", color: "#4a9aea", icon: "ST" },
    { name: "Civilization VI", status: "PLANNED", color: "#4a9aea", icon: "CV" },
  ];

  // ── Pixel particles ─────────────────────────────────────────
  interface Particle {
    id: number;
    x: number;
    size: number;
    opacity: number;
    duration: number;
    delay: number;
    drift: number;
  }

  function seededParticles(count: number, seed: number): Particle[] {
    const result: Particle[] = [];
    let s = seed;
    const LCG_MUL = 1_664_525;
    const LCG_INC = 1_013_904_223;
    const LCG_MASK = 0x7f_ff_ff_ff;

    for (let n = 0; n < count; n++) {
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const x = (s % 10_000) / 100;
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const size = 3 + (s % 4);
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const opacity = 0.15 + (s % 25) / 100;
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const duration = 8 + (s % 12);
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const delay = (s % 20_000) / 1000;
      s = (s * LCG_MUL + LCG_INC) & LCG_MASK;
      const drift = (s % 60) - 30;
      result.push({ id: n, x, size, opacity, duration, delay, drift });
    }
    return result;
  }

  const particles = seededParticles(60, 42);

  // ── Single onMount: demo, scroll observer ──
  onMount(() => {
    let cancelled = false;

    // Demo typing animation
    function showNext() {
      if (cancelled || visibleCount >= conversation.length) return;
      const msg = conversation[visibleCount];
      if (!msg) return;
      typingIndex = visibleCount;
      typedText = "";
      typeChar(msg.text, 0);
    }

    function typeChar(full: string, position: number) {
      if (cancelled) return;
      if (position >= full.length) {
        visibleCount++;
        typingIndex = -1;
        typedText = "";
        if (visibleCount < conversation.length) {
          globalThis.setTimeout(showNext, visibleCount % 2 === 0 ? 800 : 1200);
        }
        return;
      }
      typedText = full.slice(0, position + 1);
      const speed = full[position] === " " ? 20 : 25 + Math.random() * 15;
      globalThis.setTimeout(() => {
        typeChar(full, position + 1);
      }, speed);
    }

    const t = globalThis.setTimeout(() => {
      demoStarted = true;
      showNext();
    }, 1200);

    // Scroll-triggered animations
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = sections.indexOf(entry.target as HTMLElement);
          if (index !== -1 && entry.isIntersecting) {
            visibleSections = new Set([...visibleSections, index]);
          }
        }
      },
      { threshold: 0.15 },
    );
    const rafHandle = globalThis.requestAnimationFrame(() => {
      for (const element of sections) {
        observer.observe(element);
      }
    });

    return () => {
      cancelled = true;
      globalThis.clearTimeout(t);
      globalThis.cancelAnimationFrame(rafHandle);
      observer.disconnect();
    };
  });
</script>

<svelte:head>
  <title>Savecraft — Player 2 for every game you play alone</title>
  <meta
    name="description"
    content="Savecraft gives AI assistants access to your actual game state. Celebrate your wins, optimize your builds, and never explain the context again."
  />
</svelte:head>

<div class="page">
  <!-- ═══ HERO AREA ═══ -->
  <div class="hero-bg">
    <div class="particle-field">
      {#each particles as p (p.id)}
        <span
          class="particle"
          style="left:{p.x}%;bottom:-4px;width:{p.size}px;height:{p.size}px;opacity:{p.opacity};animation-duration:{p.duration}s;animation-delay:{p.delay}s;--drift:{p.drift}px"
        ></span>
      {/each}
    </div>

    <!-- ═══ HERO ═══ -->
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-text">
          <div class="hero-eyebrow">PLAYER 2 HAS ENTERED THE GAME</div>
          <h1 class="hero-title">
            Your AI already<br />knows your build.
          </h1>
          <p class="hero-sub">
            Savecraft connects your AI to your actual game state — gear, skills, quests, progress.
            Not screenshots. Not memory. Real data, updated live.
          </p>
          <p class="hero-sub hero-sub-second">
            Celebrate a drop. Plan your next move. The conversation goes wherever you take it.
          </p>
          <div class="hero-actions">
            <a href={`${PUBLIC_APP_URL}/sign-up`} class="btn-gold">START YOUR JOURNEY</a>
            <a href="#how" class="btn-outline">SEE HOW IT WORKS</a>
          </div>
        </div>

        <!-- Conversation demo -->
        <div class="demo-panel">
          <div class="demo-header">
            <span class="demo-dot green"></span>
            <span class="demo-label">STARDEW VALLEY — SUNRISE FARM, YEAR 3</span>
          </div>
          <div class="demo-body">
            {#each conversation.slice(0, visibleCount) as msg (msg.text)}
              <div
                class="demo-msg"
                class:demo-player={msg.role === "player"}
                class:demo-ai={msg.role === "ai"}
              >
                <span class="demo-role">{msg.role === "player" ? "YOU" : "AI"}</span>
                <span class="demo-text">{msg.text}</span>
              </div>
            {/each}
            {#if typingIndex >= 0}
              {@const msg = conversation[typingIndex]}
              {#if msg}
                <div
                  class="demo-msg"
                  class:demo-player={msg.role === "player"}
                  class:demo-ai={msg.role === "ai"}
                >
                  <span class="demo-role">{msg.role === "player" ? "YOU" : "AI"}</span>
                  <span class="demo-text">
                    {typedText}<span class="cursor">|</span>
                  </span>
                </div>
              {/if}
            {/if}
            {#if !demoStarted}
              <div class="demo-msg demo-player">
                <span class="demo-role">YOU</span>
                <span class="demo-text"><span class="cursor">|</span></span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </section>
  </div>
  <!-- /hero-bg -->

  <!-- ═══ SOCIAL PROOF LINE (divider between hero and content) ═══ -->
  <div class="proof-bar">
    <span class="proof-item">Works with Claude, ChatGPT, and Gemini</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Open source daemon</span>
    <span class="proof-sep">*</span>
    <span class="proof-item">Read-only — can never modify your saves</span>
  </div>

  <!-- ═══ HOW IT WORKS ═══ -->
  <section id="how" class="section" bind:this={sections[0]}>
    <div class="section-inner" class:visible={visibleSections.has(0)}>
      <div class="section-eyebrow">HOW IT WORKS</div>
      <h2 class="section-title">Three steps to Player 2</h2>

      <div class="steps-grid">
        <div class="step-card">
          <div class="step-num">01</div>
          <div class="step-icon" style="color: var(--color-green);">></div>
          <h3 class="step-name">INSTALL</h3>
          <p class="step-desc">
            A background daemon watches your save files. Runs on PC, Mac, Steam Deck. One command,
            zero config.
          </p>
          <code class="step-code">curl -sSL {PUBLIC_INSTALL_URL} | bash</code>
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
            Connect Claude, ChatGPT, or Gemini. Your AI reads your actual game state and gives
            answers grounded in real data — not hallucinated guesses.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ DUAL MODE ═══ -->
  <section class="section" bind:this={sections[1]}>
    <div class="section-inner" class:visible={visibleSections.has(1)}>
      <div class="section-eyebrow">TWO MODES, ONE CONVERSATION</div>
      <h2 class="section-title">Companion and optimizer</h2>
      <p class="section-sub">Same tools, same data. The conversation goes wherever you take it.</p>

      <div class="modes-grid">
        <div class="mode-card">
          <div class="mode-header companion-header">
            <span class="mode-icon">~</span>
            <span class="mode-label">COMPANION</span>
          </div>
          <div class="mode-body">
            <div class="mode-example">
              <span class="mode-you">YOU</span>
              <span class="mode-text">"ANOTHER Countess run and ZERO RUNES. I'm losing it."</span>
            </div>
            <div class="mode-example">
              <span class="mode-ai">AI</span>
              <span class="mode-text"
                >"23 runs tracked. She only drops up to Io in Hell though — if you need Shaels,
                Normal Countess is actually better odds. Your Sorc clears it in 40 seconds. Want to
                switch it up?"</span
              >
            </div>
          </div>
        </div>

        <div class="mode-card">
          <div class="mode-header optimizer-header">
            <span class="mode-icon">=</span>
            <span class="mode-label">OPTIMIZER</span>
          </div>
          <div class="mode-body">
            <div class="mode-example">
              <span class="mode-you">YOU</span>
              <span class="mode-text">"Am I hitting my FCR breakpoint?"</span>
            </div>
            <div class="mode-example">
              <span class="mode-ai">AI</span>
              <span class="mode-text"
                >"You're at 75% FCR — one breakpoint short of 125%. Swapping your Spirit shield for
                a 35% FCR one would get you there. Or craft a 20% amulet to keep the resistances."</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ GAMES ═══ -->
  <section id="games" class="section" bind:this={sections[2]}>
    <div class="section-inner" class:visible={visibleSections.has(2)}>
      <div class="section-eyebrow">SUPPORTED GAMES</div>
      <h2 class="section-title">Supported games</h2>

      <div class="games-grid">
        {#each games as game (game.name)}
          <div class="game-card">
            <span class="game-icon">{game.icon}</span>
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
    </div>
  </section>

  <!-- ═══ SECURITY ═══ -->
  <section class="section" bind:this={sections[3]}>
    <div class="section-inner" class:visible={visibleSections.has(3)}>
      <div class="section-eyebrow" style="color: var(--color-green);">SECURITY</div>
      <h2 class="section-title">Your data stays yours</h2>

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
    </div>
  </section>

  <!-- ═══ COMMUNITY ═══ -->
  <section class="section" bind:this={sections[4]}>
    <div class="section-inner" class:visible={visibleSections.has(4)}>
      <div class="section-eyebrow">COMMUNITY</div>
      <h2 class="section-title">Join us</h2>
      <p class="section-sub">
        Savecraft is open source and community-driven. Come hang out, request games, report bugs, or
        just talk builds.
      </p>

      <div class="community-grid">
        <a
          href="https://discord.gg/YnC8stpEmF"
          class="community-card"
          target="_blank"
          rel="noopener"
        >
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
    </div>
  </section>

  <!-- ═══ CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">Ready for Player 2?</h2>
      <p class="cta-sub">Install in 30 seconds. Works with Claude, ChatGPT, and Gemini.</p>
      <div class="cta-actions">
        <a href={`${PUBLIC_APP_URL}/sign-up`} class="btn-gold btn-large">GET STARTED</a>
      </div>
      <div class="cta-install">
        <code class="install-code">curl -sSL {PUBLIC_INSTALL_URL} | bash</code>
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

  .particle-field {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .particle {
    position: absolute;
    background: var(--color-gold);
    image-rendering: pixelated;
    animation: float-up linear infinite;
  }

  @keyframes float-up {
    0% {
      transform: translateY(0) translateX(0);
      opacity: 0;
    }
    5% {
      opacity: var(--p-opacity, 0.2);
    }
    80% {
      opacity: var(--p-opacity, 0.2);
    }
    100% {
      transform: translateY(-120vh) translateX(var(--drift, 0px));
      opacity: 0;
    }
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

  .hero-sub-second {
    margin-top: 12px;
    margin-bottom: 32px;
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

  /* ── Demo panel ──────────────────────────────────────── */
  .demo-panel {
    background:
      radial-gradient(ellipse at 20% 0%, rgba(90, 60, 180, 0.12) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 100%, rgba(200, 168, 78, 0.06) 0%, transparent 50%),
      linear-gradient(160deg, #0c1238 0%, #111b47 40%, #0e1540 70%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(122, 138, 237, 0.08),
      inset 0 0 30px rgba(30, 40, 100, 0.3),
      0 0 40px rgba(74, 90, 173, 0.15),
      0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .demo-header {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.2);
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(5, 7, 26, 0.5);
  }

  .demo-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .demo-dot.green {
    background: var(--color-green);
    box-shadow: 0 0 6px rgba(90, 190, 138, 0.5);
  }

  .demo-label {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .demo-body {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 400px;
    overflow-y: auto;
  }

  .demo-msg {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .demo-role {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .demo-player .demo-role {
    color: var(--color-green);
  }

  .demo-ai .demo-role {
    color: var(--color-gold);
  }

  .demo-text {
    font-family: var(--font-body);
    font-size: 20px;
    line-height: 1.35;
    color: var(--color-text);
  }

  .cursor {
    color: var(--color-gold);
    font-weight: bold;
    animation: blink 1.06s step-end infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
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

  /* ── Sections ────────────────────────────────────────── */
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

  .section-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 16px;
  }

  .section-sub {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 400;
    color: var(--color-text-dim);
    max-width: 560px;
    margin-bottom: 40px;
    line-height: 1.6;
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

  /* ── Modes ───────────────────────────────────────────── */
  .modes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .mode-card {
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-header {
    padding: 12px 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.2);
    background: rgba(5, 7, 26, 0.4);
  }

  .mode-icon {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
  }

  .mode-label {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .companion-header .mode-icon,
  .companion-header .mode-label {
    color: var(--color-green);
  }

  .optimizer-header .mode-icon,
  .optimizer-header .mode-label {
    color: var(--color-blue);
  }

  .mode-body {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mode-example {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .mode-you {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    color: var(--color-green);
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .mode-ai {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    color: var(--color-gold);
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .mode-text {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-text);
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

  /* ── Footer ──────────────────────────────────────────── */
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

    .section {
      padding: 60px 20px;
    }

    .games-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
