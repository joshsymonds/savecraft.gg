<!--
  @component
  Retro terminal/boot panel shown beneath ConnectCard when nothing is
  connected yet. First-run leads with one verb — "Add a game" — which
  opens the unified catalog (Req 17b). Daemon install, OAuth, mod-install
  and reference-ready are contextual outcomes of picking a game, never
  the first-run headline.
-->
<script lang="ts">
  import Panel from "./Panel.svelte";

  let { onaddgame }: { onaddgame?: () => void } = $props();
</script>

<div class="empty-state">
  <div class="terminal">
    <div class="terminal-header">
      <p class="terminal-line prompt">&gt; CONNECT A GAME</p>
      <p class="terminal-line prompt dim">
        &gt; PICK A GAME AND SAVECRAFT WIRES IT UP<span class="cursor">_</span>
      </p>
    </div>

    <div class="glow-wrap">
      <Panel accent="#c8a84e30">
        <div class="cta-body">
          <p class="cta-desc">
            Add a game and Savecraft connects it the right way for that game: your account, your
            save files, or an in-game mod. Reference data (rules, items, builds, prices) works the
            moment it is added.
          </p>
          <button class="add-game-button" onclick={() => onaddgame?.()}>
            <span class="add-game-icon">+</span>
            <span class="add-game-label">ADD A GAME</span>
          </button>
        </div>
      </Panel>
    </div>
  </div>

  <div class="scanlines"></div>
</div>

<style>
  .empty-state {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    width: 100%;
  }

  .terminal {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 560px;
    width: 100%;
  }

  /* -- Terminal header lines -------------------------------- */

  .terminal-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 4px;
  }

  .terminal-line {
    font-family: var(--font-pixel);
    font-size: 13px;
    letter-spacing: 1.5px;
    margin: 0;
    line-height: 1.6;
  }

  .terminal-line.prompt {
    color: var(--color-gold);
  }

  .terminal-line.dim {
    color: var(--color-text-muted);
  }

  .cursor {
    animation: blink 1s step-end infinite;
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

  /* -- Call to action --------------------------------------- */

  .cta-body {
    padding: 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .cta-desc {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    line-height: 1.55;
    margin: 0;
  }

  .add-game-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    align-self: flex-start;
    padding: 12px 24px;
    background: rgba(200, 168, 78, 0.08);
    border: 2px solid var(--color-gold);
    border-radius: 4px;
    cursor: pointer;
    transition:
      background 0.15s,
      box-shadow 0.15s;
    box-shadow: 0 0 12px rgba(200, 168, 78, 0.1);
  }

  .add-game-button:hover {
    background: rgba(200, 168, 78, 0.15);
    box-shadow: 0 0 20px rgba(200, 168, 78, 0.2);
  }

  .add-game-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .add-game-icon {
    font-family: var(--font-body);
    font-size: 22px;
    color: var(--color-gold);
    line-height: 1;
  }

  .add-game-label {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  /* -- Glow wrap -------------------------------------------- */

  .glow-wrap {
    animation: glow-pulse 4s ease-in-out infinite;
    border-radius: 4px;
  }

  @keyframes glow-pulse {
    0%,
    100% {
      filter: drop-shadow(0 0 8px rgba(200, 168, 78, 0.08));
    }
    50% {
      filter: drop-shadow(0 0 16px rgba(200, 168, 78, 0.15));
    }
  }

  /* -- CRT scan lines --------------------------------------- */

  .scanlines {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
  }
</style>
