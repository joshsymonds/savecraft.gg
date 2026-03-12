<!--
  @component
  Retro terminal/boot screen empty state shown when no sources are connected.
  Wraps AddSourceContent with CRT-inspired visual effects.
-->
<script lang="ts">
  import AddSourceContent from "./AddSourceContent.svelte";
  import Panel from "./Panel.svelte";

  let {
    onsubmit,
    onapiskip,
  }: {
    onsubmit?: (code: string) => void;
    onapiskip?: () => void;
  } = $props();
</script>

<div class="empty-state">
  <div class="terminal" class:wide={!!onapiskip}>
    <!-- Terminal header lines -->
    <div class="terminal-header">
      <p class="terminal-line prompt">&gt; NO SOURCES DETECTED</p>
      <p class="terminal-line prompt dim">
        &gt; ADD A SOURCE TO START SYNCING YOUR SAVES TO AI<span class="cursor">_</span>
      </p>
    </div>

    <!-- Content panel with glow -->
    <div class="glow-wrap">
      <Panel accent="#c8a84e30">
        <AddSourceContent {onsubmit} {onapiskip} />
      </Panel>
    </div>
  </div>

  <!-- CRT scan line overlay -->
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

  .terminal.wide {
    max-width: 720px;
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
