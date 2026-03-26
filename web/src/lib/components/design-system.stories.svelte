<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Design System",
    component: Panel,
    tags: ["autodocs"],
  });

  const colors = [
    { name: "--color-bg", label: "Background" },
    { name: "--color-border", label: "Border" },
    { name: "--color-border-light", label: "Border Light" },
    { name: "--color-gold", label: "Gold" },
    { name: "--color-gold-light", label: "Gold Light" },
    { name: "--color-green", label: "Green" },
    { name: "--color-red", label: "Red" },
    { name: "--color-yellow", label: "Yellow" },
    { name: "--color-blue", label: "Blue" },
    { name: "--color-text", label: "Text" },
    { name: "--color-text-dim", label: "Text Dim" },
    { name: "--color-text-muted", label: "Text Muted" },
  ];

  // ── Font candidates ──────────────────────────────────────────
  // "Pixel" = small caps, labels, buttons. "Heading" = titles, hero text. "Body" = readable copy.
  const pixelFonts = [
    { label: "Press Start 2P (current)", value: "'Press Start 2P', monospace" },
    { label: "Silkscreen", value: "'Silkscreen', monospace" },
    { label: "Pixelify Sans", value: "'Pixelify Sans', sans-serif" },
    { label: "DotGothic16", value: "'DotGothic16', sans-serif" },
    { label: "Share Tech Mono", value: "'Share Tech Mono', monospace" },
  ];

  const headingFonts = [
    { label: "Space Grotesk (current)", value: "'Space Grotesk', sans-serif" },
    { label: "Outfit", value: "'Outfit', sans-serif" },
    { label: "Chakra Petch", value: "'Chakra Petch', sans-serif" },
    { label: "Orbitron", value: "'Orbitron', sans-serif" },
    { label: "Rajdhani", value: "'Rajdhani', sans-serif" },
    { label: "Inter", value: "'Inter', sans-serif" },
    { label: "Pixelify Sans", value: "'Pixelify Sans', sans-serif" },
    { label: "Silkscreen", value: "'Silkscreen', monospace" },
  ];

  const bodyFonts = [
    { label: "VT323 (current)", value: "'VT323', monospace" },
    { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
    { label: "Share Tech Mono", value: "'Share Tech Mono', monospace" },
    { label: "Outfit", value: "'Outfit', sans-serif" },
    { label: "Chakra Petch", value: "'Chakra Petch', sans-serif" },
    { label: "Rajdhani", value: "'Rajdhani', sans-serif" },
    { label: "Inter", value: "'Inter', sans-serif" },
  ];
</script>

<script lang="ts">
  // Reactive state for font picker
  let pixelFont = $state("'Press Start 2P', monospace");
  let headingFont = $state("'Chakra Petch', sans-serif");
  let bodyFont = $state("'Rajdhani', sans-serif");
</script>

<!-- Color Palette -->
<Story name="Color Palette">
  <div style="width: 640px; padding: 24px;">
    <div
      style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 20px;"
    >
      COLOR PALETTE
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
      {#each colors as c (c.name)}
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div
            style="width: 100%; height: 48px; border-radius: 4px; background: var({c.name}); border: 1px solid rgba(74,90,173,0.2);"
          ></div>
          <div
            style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-text); letter-spacing: 0.5px;"
          >
            {c.label}
          </div>
          <div
            style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);"
          >
            {c.name}
          </div>
        </div>
      {/each}
    </div>

    <div style="margin-top: 32px;">
      <div
        style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 16px;"
      >
        PANEL BACKGROUND
      </div>
      <div
        style="width: 100%; height: 80px; border-radius: 6px; background: var(--color-panel-bg); border: 1px solid rgba(74,90,173,0.2); display: flex; align-items: center; justify-content: center;"
      >
        <span style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);"
          >--color-panel-bg (gradient)</span
        >
      </div>
    </div>
  </div>
</Story>

<!-- ═══════════════════════════════════════════════════════════
     FONT LAB — Interactive font comparison
     ═══════════════════════════════════════════════════════════ -->
<Story name="Font Lab">
  <div style="width: 1100px; padding: 16px;">
    <!-- ── Font picker bar ── -->
    <div
      style="display: flex; gap: 16px; padding: 12px 16px; margin-bottom: 20px; border: 1px solid rgba(74,90,173,0.25); border-radius: 6px; background: rgba(10,14,46,0.8); align-items: center; flex-wrap: wrap;"
    >
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <label
          for="pick-pixel"
          style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-gold); letter-spacing: 1px;"
          >PIXEL / LABEL FONT</label
        >
        <select
          id="pick-pixel"
          bind:value={pixelFont}
          style="background: #0a0e2e; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 3px; padding: 4px 8px; font-size: 12px; font-family: var(--font-body);"
        >
          {#each pixelFonts as f (f.label)}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <label
          for="pick-heading"
          style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-gold); letter-spacing: 1px;"
          >HEADING FONT</label
        >
        <select
          id="pick-heading"
          bind:value={headingFont}
          style="background: #0a0e2e; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 3px; padding: 4px 8px; font-size: 12px; font-family: var(--font-body);"
        >
          {#each headingFonts as f (f.label)}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <label
          for="pick-body"
          style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-gold); letter-spacing: 1px;"
          >BODY FONT</label
        >
        <select
          id="pick-body"
          bind:value={bodyFont}
          style="background: #0a0e2e; color: var(--color-text); border: 1px solid var(--color-border); border-radius: 3px; padding: 4px 8px; font-size: 12px; font-family: var(--font-body);"
        >
          {#each bodyFonts as f (f.label)}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- ── Two-column layout: Site hero | Dashboard ── -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- ══ LEFT: Site homepage hero ══ -->
      <div>
        <div
          style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-text-muted); letter-spacing: 1px; margin-bottom: 8px;"
        >
          SITE HOMEPAGE (staging.savecraft.gg)
        </div>
        <div
          style="border: 1px solid rgba(74,90,173,0.2); border-radius: 6px; overflow: hidden; background: var(--color-bg);"
        >
          <!-- Nav -->
          <nav
            style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(74,90,173,0.1); background: rgba(5,7,26,0.6);"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <div
                style="width: 20px; height: 20px; background: var(--color-gold); border-radius: 3px; opacity: 0.6;"
              ></div>
              <span
                style="font-family: {pixelFont}; font-size: 10px; color: var(--color-gold); letter-spacing: 2px;"
                >SAVECRAFT</span
              >
            </div>
            <div style="display: flex; gap: 14px; align-items: center;">
              <span
                style="font-family: {headingFont}; font-size: 11px; color: var(--color-text-dim); letter-spacing: 1px;"
                >GAMES</span
              >
              <span
                style="font-family: {headingFont}; font-size: 11px; color: var(--color-text-dim); letter-spacing: 1px;"
                >DISCORD</span
              >
              <span
                style="font-family: {pixelFont}; font-size: 8px; color: var(--color-bg); background: var(--color-gold); padding: 5px 10px; border-radius: 3px; letter-spacing: 1px;"
                >GET STARTED</span
              >
            </div>
          </nav>

          <!-- Hero -->
          <div style="padding: 32px 20px 28px;">
            <div
              style="font-family: {pixelFont}; font-size: 7px; color: var(--color-gold); letter-spacing: 3px; margin-bottom: 14px;"
            >
              PLAYER 2 HAS ENTERED THE GAME
            </div>
            <h1
              style="font-family: {headingFont}; font-size: 28px; font-weight: 700; color: var(--color-text); line-height: 1.15; margin-bottom: 14px;"
            >
              Your AI already<br />knows your build.
            </h1>
            <p
              style="font-family: {headingFont}; font-size: 14px; font-weight: 400; color: var(--color-text-dim); line-height: 1.5; margin-bottom: 20px; max-width: 380px;"
            >
              Savecraft connects your AI to your actual game state — gear, skills, quests, progress.
              Not screenshots. Not memory. Real data, updated live.
            </p>
            <div style="display: flex; gap: 10px;">
              <span
                style="font-family: {pixelFont}; font-size: 8px; color: var(--color-bg); background: var(--color-gold); padding: 8px 14px; border-radius: 4px; letter-spacing: 1px;"
                >START YOUR JOURNEY</span
              >
              <span
                style="font-family: {pixelFont}; font-size: 8px; color: var(--color-text); border: 1px solid var(--color-border); padding: 8px 14px; border-radius: 4px; letter-spacing: 1px;"
                >SEE HOW IT WORKS</span
              >
            </div>
          </div>

          <!-- Proof bar -->
          <div
            style="display: flex; justify-content: center; gap: 12px; padding: 10px; border-top: 1px solid rgba(74,90,173,0.1); background: rgba(5,7,26,0.3);"
          >
            <span
              style="font-family: {headingFont}; font-size: 10px; color: var(--color-text-muted);"
              >Works with Claude and ChatGPT</span
            >
            <span style="font-family: {pixelFont}; font-size: 8px; color: var(--color-text-muted);"
              >*</span
            >
            <span
              style="font-family: {headingFont}; font-size: 10px; color: var(--color-text-muted);"
              >Open source daemon</span
            >
          </div>

          <!-- How it works -->
          <div style="padding: 20px 16px;">
            <div
              style="font-family: {pixelFont}; font-size: 7px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 8px;"
            >
              HOW IT WORKS
            </div>
            <h2
              style="font-family: {headingFont}; font-size: 20px; font-weight: 600; color: var(--color-text); margin-bottom: 14px;"
            >
              Three steps to Player 2
            </h2>
            <div style="display: flex; gap: 10px;">
              {#each [{ num: "01", icon: ">", name: "INSTALL", desc: "A background daemon watches your save files." }, { num: "02", icon: "{ }", name: "PARSE", desc: "Plugins extract gear, skills, progress, items." }, { num: "03", icon: "?", name: "ASK", desc: "Your AI reads real game state, not guesses." }] as step (step.num)}
                <div
                  style="flex: 1; padding: 12px; border: 1px solid rgba(74,90,173,0.1); border-radius: 4px;"
                >
                  <div
                    style="font-family: {headingFont}; font-size: 18px; font-weight: 700; color: rgba(74,90,173,0.2); margin-bottom: 4px;"
                  >
                    {step.num}
                  </div>
                  <div
                    style="font-family: {pixelFont}; font-size: 7px; color: var(--color-text); letter-spacing: 1px; margin-bottom: 6px;"
                  >
                    {step.name}
                  </div>
                  <div
                    style="font-family: {bodyFont}; font-size: 14px; color: var(--color-text-dim); line-height: 1.4;"
                  >
                    {step.desc}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- ══ RIGHT: Web app dashboard ══ -->
      <div>
        <div
          style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-text-muted); letter-spacing: 1px; margin-bottom: 8px;"
        >
          WEB APP DASHBOARD (app.savecraft.gg)
        </div>
        <div
          style="border: 1px solid rgba(74,90,173,0.2); border-radius: 6px; overflow: hidden; background: var(--color-bg);"
        >
          <!-- App header -->
          <header
            style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid rgba(74,90,173,0.1); background: rgba(5,7,26,0.6);"
          >
            <span
              style="font-family: {pixelFont}; font-size: 11px; color: var(--color-gold); letter-spacing: 3px;"
              >SAVECRAFT</span
            >
            <div
              style="width: 24px; height: 24px; border-radius: 50%; background: var(--color-border); opacity: 0.4;"
            ></div>
          </header>

          <!-- Source strip -->
          <div
            style="display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid rgba(74,90,173,0.08); background: rgba(5,7,26,0.2);"
          >
            {#each [{ name: "STEAM-DECK", status: "online" }, { name: "DESKTOP-PC", status: "offline" }] as source (source.name)}
              <div
                style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid rgba(74,90,173,0.15); border-radius: 3px; background: rgba(74,90,173,0.05);"
              >
                <span
                  style="width: 5px; height: 5px; border-radius: 50%; background: {source.status ===
                  'online'
                    ? 'var(--color-green)'
                    : 'var(--color-text-muted)'};"
                ></span>
                <span
                  style="font-family: {pixelFont}; font-size: 7px; color: var(--color-text); letter-spacing: 0.5px;"
                  >{source.name}</span
                >
              </div>
            {/each}
            <div
              style="display: flex; align-items: center; padding: 4px 8px; border: 1px dashed rgba(74,90,173,0.2); border-radius: 3px; cursor: pointer;"
            >
              <span
                style="font-family: {pixelFont}; font-size: 7px; color: var(--color-text-muted); letter-spacing: 0.5px;"
                >+ ADD</span
              >
            </div>
          </div>

          <!-- Dashboard content -->
          <div style="display: grid; grid-template-columns: 1fr 180px; min-height: 340px;">
            <!-- Main content -->
            <div style="padding: 14px 16px;">
              <!-- Game panel header -->
              <div
                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"
              >
                <div style="display: flex; gap: 8px;">
                  {#each [{ name: "D2R", active: true }, { name: "STARDEW", active: false }] as tab (tab.name)}
                    <span
                      style="font-family: {pixelFont}; font-size: 8px; color: {tab.active
                        ? 'var(--color-gold)'
                        : 'var(--color-text-muted)'}; letter-spacing: 1px; padding-bottom: 4px; border-bottom: {tab.active
                        ? '2px solid var(--color-gold)'
                        : 'none'};">{tab.name}</span
                    >
                  {/each}
                </div>
                <span
                  style="font-family: {pixelFont}; font-size: 6px; color: var(--color-text-muted); letter-spacing: 0.5px; padding: 3px 6px; border: 1px solid rgba(74,90,173,0.15); border-radius: 3px;"
                  >+ ADD GAME</span
                >
              </div>

              <!-- Save rows -->
              {#each [{ name: "Atmus", summary: "Hammerdin, Level 89 Paladin", time: "2 min ago" }, { name: "WindRunner", summary: "Javazon, Level 82 Amazon", time: "1 hour ago" }, { name: "FrostNova", summary: "Blizzard Sorc, Level 91 Sorceress", time: "3 hours ago" }] as save (save.name)}
                <div
                  style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid rgba(74,90,173,0.08); border-radius: 4px; margin-bottom: 6px;"
                >
                  <div>
                    <div
                      style="font-family: {pixelFont}; font-size: 8px; color: var(--color-text); letter-spacing: 0.5px; margin-bottom: 3px;"
                    >
                      {save.name}
                    </div>
                    <div
                      style="font-family: {bodyFont}; font-size: 14px; color: var(--color-text-dim);"
                    >
                      {save.summary}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div
                      style="font-family: {bodyFont}; font-size: 13px; color: var(--color-text-muted);"
                    >
                      {save.time}
                    </div>
                    <div
                      style="font-family: {pixelFont}; font-size: 6px; color: var(--color-green); letter-spacing: 0.5px; margin-top: 2px;"
                    >
                      SYNCED
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <!-- Activity sidebar -->
            <div
              style="border-left: 1px solid rgba(74,90,173,0.1); background: rgba(5,7,26,0.3); padding: 12px;"
            >
              <div
                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(74,90,173,0.1);"
              >
                <span
                  style="font-family: {pixelFont}; font-size: 7px; color: var(--color-gold); letter-spacing: 2px;"
                  >ACTIVITY</span
                >
                <span
                  style="font-family: {pixelFont}; font-size: 6px; color: var(--color-green); display: flex; align-items: center; gap: 4px;"
                >
                  <span
                    style="width: 4px; height: 4px; border-radius: 50%; background: var(--color-green);"
                  ></span>
                  LIVE
                </span>
              </div>
              {#each [{ type: "save_updated", msg: "Atmus updated", time: "2m" }, { type: "source_online", msg: "STEAM-DECK online", time: "5m" }, { type: "save_updated", msg: "WindRunner updated", time: "1h" }, { type: "note_created", msg: "Note added to Atmus", time: "2h" }] as event (event.msg)}
                <div style="margin-bottom: 10px;">
                  <div
                    style="font-family: {bodyFont}; font-size: 13px; color: var(--color-text); line-height: 1.3;"
                  >
                    {event.msg}
                  </div>
                  <div
                    style="font-family: {bodyFont}; font-size: 12px; color: var(--color-text-muted);"
                  >
                    {event.time} ago
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- App footer -->
          <footer
            style="display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; border-top: 1px solid rgba(74,90,173,0.1); background: rgba(5,7,26,0.6);"
          >
            <span
              style="font-family: {headingFont}; font-size: 10px; color: var(--color-text-muted);"
              >savecraft.gg — by @joshsymonds</span
            >
            <div style="display: flex; gap: 12px;">
              {#each ["HOME", "DISCORD", "GITHUB"] as link (link)}
                <span
                  style="font-family: {headingFont}; font-size: 9px; color: var(--color-text-muted); letter-spacing: 1px;"
                  >{link}</span
                >
              {/each}
            </div>
          </footer>
        </div>
      </div>
    </div>
  </div>
</Story>
