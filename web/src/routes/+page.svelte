<!--
  @component
  Marketing homepage — public landing page for savecraft.gg
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { resolve } from "$app/paths";
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

  // Start demo after mount delay
  onMount(() => {
    const t = globalThis.setTimeout(() => {
      demoStarted = true;
      showNext();
    }, 1200);
    return () => {
      globalThis.clearTimeout(t);
    };
  });

  function showNext() {
    if (visibleCount >= conversation.length) return;
    const msg = conversation[visibleCount];
    if (!msg) return;
    typingIndex = visibleCount;
    typedText = "";
    typeChar(msg.text, 0);
  }

  function typeChar(full: string, position: number) {
    if (position >= full.length) {
      // Done typing this message
      visibleCount++;
      typingIndex = -1;
      typedText = "";
      // Show next after a pause
      if (visibleCount < conversation.length) {
        globalThis.setTimeout(showNext, visibleCount % 2 === 0 ? 800 : 1200);
      }
      return;
    }
    typedText = full.slice(0, position + 1);
    // eslint-disable-next-line sonarjs/pseudo-random
    const speed = full[position] === " " ? 20 : 25 + Math.random() * 15;
    globalThis.setTimeout(() => {
      typeChar(full, position + 1);
    }, speed);
  }

  // ── Scroll-triggered animations ──────────────────────────────
  let sections = $state<HTMLElement[]>([]);
  let visibleSections = $state(new Set<number>());

  onMount(() => {
    if (!browser) return;
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
    // Defer to let refs populate
    globalThis.requestAnimationFrame(() => {
      for (const element of sections) {
        observer.observe(element);
      }
    });
    return () => {
      observer.disconnect();
    };
  });

  // ── Games data ───────────────────────────────────────────────
  const games = [
    { name: "Diablo II: Resurrected", format: ".d2s binary", status: "AVAILABLE", color: "#5abe8a", icon: "II" },
    { name: "Stardew Valley", format: "XML save", status: "COMING SOON", color: "#c8a84e", icon: "SV" },
    { name: "Path of Exile 2", format: "GGG API", status: "COMING SOON", color: "#c8a84e", icon: "P2" },
    { name: "Baldur's Gate 3", format: ".lsv Larian", status: "PLANNED", color: "#4a9aea", icon: "BG" },
    { name: "Stellaris", format: "Clausewitz", status: "PLANNED", color: "#4a9aea", icon: "ST" },
    { name: "Civilization VI", format: ".Civ6Save", status: "PLANNED", color: "#4a9aea", icon: "CV" },
  ];

  // ── Pixel particles ─────────────────────────────────────────
  // Tiny squares floating upward — "data rising to the cloud."
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
    const LCG_MASK = 0x7F_FF_FF_FF;

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

  <!-- ═══ NAV ═══ -->
  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-left">
        <svg width="24" height="24" viewBox="0 0 16 16" class="nav-icon">
          <rect x="2" y="1" width="12" height="14" fill="#4a5aad" stroke="#7a8aed" stroke-width="0.5" />
          <rect x="4" y="1" width="8" height="5" fill="#0a0e2e" stroke="#4a5aad" stroke-width="0.3" />
          <rect x="6" y="2" width="4" height="3" fill="#c8a84e" />
          <rect x="4" y="10" width="8" height="4" rx="0.5" fill="#111b47" stroke="#4a5aad" stroke-width="0.3" />
        </svg>
        <span class="nav-title">SAVECRAFT</span>
      </div>
      <div class="nav-right">
        <a href="#how" class="nav-link">HOW IT WORKS</a>
        <a href="#games" class="nav-link">GAMES</a>
        <a href={resolve("/sign-up")} class="nav-cta">GET STARTED</a>
      </div>
    </div>
  </nav>

  <!-- ═══ HERO ═══ -->
  <section class="hero">
    <div class="hero-grid">
      <div class="hero-text">
        <div class="hero-eyebrow">PLAYER 2 HAS ENTERED THE GAME</div>
        <h1 class="hero-title">
          Your AI already<br />knows your build.
        </h1>
        <p class="hero-sub">
          Savecraft gives AI assistants your actual game state — gear, skills, quests, progress.
          Not screenshots. Not memory. Real data, served live via
          <a href="https://modelcontextprotocol.io/" class="mcp-link" target="_blank" rel="noopener">MCP</a>.
        </p>
        <p class="hero-sub hero-sub-second">
          Celebrate a drop. Plan your next move. The conversation goes wherever you take it.
        </p>
        <div class="hero-actions">
          <a href={resolve("/sign-up")} class="btn-gold">START YOUR JOURNEY</a>
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
            <div class="demo-msg" class:demo-player={msg.role === "player"} class:demo-ai={msg.role === "ai"}>
              <span class="demo-role">{msg.role === "player" ? "YOU" : "AI"}</span>
              <span class="demo-text">{msg.text}</span>
            </div>
          {/each}
          {#if typingIndex >= 0}
            {@const msg = conversation[typingIndex]}
            {#if msg}
              <div class="demo-msg" class:demo-player={msg.role === "player"} class:demo-ai={msg.role === "ai"}>
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

  </div><!-- /hero-bg -->

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
      <div class="section-eyebrow">SYSTEM OVERVIEW</div>
      <h2 class="section-title">Three steps to Player 2</h2>

      <div class="steps-grid">
        <div class="step-card">
          <div class="step-num">01</div>
          <div class="step-icon" style="color: var(--color-green);">></div>
          <h3 class="step-name">INSTALL</h3>
          <p class="step-desc">
            A background daemon watches your save files. Runs on PC, Mac, Steam Deck. One command, zero config.
          </p>
          <code class="step-code">curl -sSL install.savecraft.gg | bash</code>
        </div>
        <div class="step-card">
          <div class="step-num">02</div>
          <div class="step-icon" style="color: var(--color-blue);">{'{ }'}</div>
          <h3 class="step-name">PARSE</h3>
          <p class="step-desc">
            WASM plugins parse your saves into structured JSON. Sandboxed — plugins cannot touch your filesystem or network. Signed and verified.
          </p>
        </div>
        <div class="step-card">
          <div class="step-num">03</div>
          <div class="step-icon" style="color: var(--color-gold);">?</div>
          <h3 class="step-name">ASK</h3>
          <p class="step-desc">
            Connect your AI assistant via MCP. It reads your actual state — items, skills, quests — and gives answers grounded in real data.
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
      <p class="section-sub">
        Same tools, same data. The conversation goes wherever you take it.
      </p>

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
              <span class="mode-text">"23 runs tracked. She only drops up to Io in Hell though — if you need Shaels, Normal Countess is actually better odds. Your Sorc clears it in 40 seconds. Want to switch it up?"</span>
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
              <span class="mode-text">"You're at 75% FCR — one breakpoint short of 125%. Swapping your Spirit shield for a 35% FCR one would get you there. Or craft a 20% amulet to keep the resistances."</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ GAMES ═══ -->
  <section id="games" class="section" bind:this={sections[2]}>
    <div class="section-inner" class:visible={visibleSections.has(2)}>
      <div class="section-eyebrow">PLUGIN REGISTRY</div>
      <h2 class="section-title">Supported games</h2>

      <div class="games-grid">
        {#each games as game (game.name)}
          <div class="game-card">
            <span class="game-icon">{game.icon}</span>
            <div class="game-info">
              <span class="game-name">{game.name}</span>
              <span class="game-format">{game.format}</span>
            </div>
            <span class="game-status" style="color: {game.color}; border-color: {game.color}40; background: {game.color}10;">
              {game.status}
            </span>
          </div>
        {/each}
      </div>

      <p class="games-note">
        Plugins are WASM binaries. Write a parser in Go, Rust, or Zig — anything targeting WASI Preview 1.
        <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link" target="_blank" rel="noopener">Contribute a plugin</a>
      </p>
    </div>
  </section>

  <!-- ═══ SECURITY ═══ -->
  <section class="section" bind:this={sections[3]}>
    <div class="section-inner" class:visible={visibleSections.has(3)}>
      <div class="section-eyebrow" style="color: var(--color-green);">SECURITY MODEL</div>
      <h2 class="section-title">Your data stays yours</h2>

      <div class="security-grid">
        <div class="security-item">
          <span class="security-check">+</span>
          <div>
            <span class="security-label">WASM Sandboxed</span>
            <span class="security-desc">Plugins can't touch your filesystem or network. stdin in, JSON out. Structurally impossible to exfiltrate.</span>
          </div>
        </div>
        <div class="security-item">
          <span class="security-check">+</span>
          <div>
            <span class="security-label">Ed25519 Signed</span>
            <span class="security-desc">Every plugin binary is cryptographically signed and verified before loading. Tampered = refused.</span>
          </div>
        </div>
        <div class="security-item">
          <span class="security-check">+</span>
          <div>
            <span class="security-label">Read-Only Daemon</span>
            <span class="security-desc">Cannot modify your saves. Kernel-enforced on Linux via systemd sandboxing. Open source — inspect it yourself.</span>
          </div>
        </div>
        <div class="security-item">
          <span class="security-check">+</span>
          <div>
            <span class="security-label">No Filesystem Exposure</span>
            <span class="security-desc">AI sees structured JSON, never your local paths or files. Better privacy than a local MCP server.</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ═══ CTA ═══ -->
  <section class="section cta-section">
    <div class="cta-inner">
      <h2 class="cta-title">Ready for Player 2?</h2>
      <p class="cta-sub">Install in 30 seconds. Works with Claude, ChatGPT, and Gemini.</p>
      <div class="cta-actions">
        <a href={resolve("/sign-up")} class="btn-gold btn-large">GET STARTED</a>
      </div>
      <div class="cta-install">
        <code class="install-code">curl -sSL https://install.savecraft.gg | bash</code>
      </div>
    </div>
  </section>

  <!-- ═══ FOOTER ═══ -->
  <footer class="footer">
    <span class="footer-text">savecraft.gg — an Autotome.ai project</span>
    <div class="footer-links">
      <a href="https://github.com/joshsymonds/savecraft.gg" class="footer-link" target="_blank" rel="noopener">GITHUB</a>
    </div>
  </footer>
</div>

<style>
  /* ── Page ─────────────────────────────────────────────── */
  .page {
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Nav ──────────────────────────────────────────────── */
  .nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 0 32px;
    background: linear-gradient(180deg, rgba(5, 7, 26, 0.95), rgba(5, 7, 26, 0.6) 80%, transparent);
    backdrop-filter: blur(8px);
  }

  .nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 0;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nav-icon {
    image-rendering: pixelated;
  }

  .nav-title {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 2px;
  }

  .nav-right {
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .nav-link {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-dim);
    text-decoration: none;
    letter-spacing: 1px;
    transition: color 0.2s;
  }

  .nav-link:hover {
    color: var(--color-gold-light);
  }

  .nav-cta {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: #05071a;
    background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light));
    padding: 8px 18px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1px;
    transition: all 0.2s;
    box-shadow: 0 0 12px rgba(200, 168, 78, 0.25);
  }

  .nav-cta:hover {
    box-shadow: 0 0 20px rgba(200, 168, 78, 0.45);
    transform: translateY(-1px);
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
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 4px;
    margin-bottom: 20px;
  }

  .hero-title {
    font-family: var(--font-pixel);
    font-size: clamp(18px, 2.8vw, 28px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 20px;
  }

  .hero-sub {
    font-family: var(--font-body);
    font-size: 24px;
    color: var(--color-text-dim);
    line-height: 1.4;
    max-width: 480px;
  }

  .hero-sub-second {
    margin-top: 12px;
    margin-bottom: 32px;
  }

  .mcp-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .mcp-link:hover {
    border-color: var(--color-gold);
  }

  .hero-actions {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }

  /* ── Buttons ──────────────────────────────────────────── */
  .btn-gold {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: #05071a;
    background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light));
    padding: 12px 28px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1px;
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
    font-size: 9px;
    padding: 14px 36px;
  }

  .btn-outline {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-dim);
    padding: 12px 28px;
    border: 1px solid var(--color-border);
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1px;
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
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
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
    font-family: var(--font-pixel);
    font-size: 8px;
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
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
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
  }

  .proof-sep {
    font-family: var(--font-pixel);
    font-size: 6px;
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
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 3px;
    margin-bottom: 14px;
  }

  .section-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 16px;
  }

  .section-sub {
    font-family: var(--font-body);
    font-size: 22px;
    color: var(--color-text-dim);
    max-width: 560px;
    margin-bottom: 40px;
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
    font-family: var(--font-pixel);
    font-size: 20px;
    color: var(--color-border);
    opacity: 0.3;
    margin-bottom: 16px;
  }

  .step-icon {
    font-family: var(--font-pixel);
    font-size: 18px;
    margin-bottom: 16px;
  }

  .step-name {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text);
    margin-bottom: 12px;
    line-height: 1.6;
  }

  .step-desc {
    font-family: var(--font-body);
    font-size: 19px;
    color: var(--color-text-dim);
    line-height: 1.4;
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
    font-family: var(--font-pixel);
    font-size: 12px;
  }

  .mode-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    letter-spacing: 2px;
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
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-green);
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
  }

  .mode-ai {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
  }

  .mode-text {
    font-family: var(--font-body);
    font-size: 19px;
    line-height: 1.35;
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
    font-family: var(--font-pixel);
    font-size: 11px;
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
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text);
    line-height: 1.5;
  }

  .game-format {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
  }

  .game-status {
    font-family: var(--font-pixel);
    font-size: 6px;
    padding: 3px 8px;
    border-radius: 2px;
    border: 1px solid;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .games-note {
    margin-top: 24px;
    font-family: var(--font-body);
    font-size: 19px;
    color: var(--color-text-dim);
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
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-green);
    flex-shrink: 0;
    padding-top: 2px;
  }

  .security-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-green);
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .security-desc {
    display: block;
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
    line-height: 1.35;
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
    font-family: var(--font-body);
    font-size: 24px;
    color: var(--color-text-dim);
    margin-bottom: 32px;
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
  .footer {
    padding: 28px 32px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1100px;
    margin: 0 auto;
  }

  .footer-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .footer-links {
    display: flex;
    gap: 20px;
  }

  .footer-link {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text-muted);
    text-decoration: none;
    letter-spacing: 1px;
    transition: color 0.2s;
  }

  .footer-link:hover {
    color: var(--color-border-light);
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

    .proof-bar {
      flex-direction: column;
      gap: 8px;
    }

    .proof-sep {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .nav-link {
      display: none;
    }

    .hero {
      padding: 100px 20px 40px;
    }

    .section {
      padding: 60px 20px;
    }

    .games-grid {
      grid-template-columns: 1fr;
    }

    .footer {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
  }
</style>
