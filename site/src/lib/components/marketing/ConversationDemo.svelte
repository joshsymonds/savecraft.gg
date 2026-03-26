<!--
  @component
  Typing conversation demo panel. Animates messages appearing one by one
  with a character-by-character typing effect, used in marketing heroes.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { DemoMessage } from "./types";

  interface Props {
    conversation: DemoMessage[];
    headerLabel: string;
    headerDotColor?: string;
    startDelay?: number;
    /** Fixed height for the demo body (CSS value). Defaults to 400px. */
    bodyHeight?: string;
  }

  let {
    conversation,
    headerLabel,
    headerDotColor = "var(--color-green)",
    startDelay = 1200,
    bodyHeight = "400px",
  }: Props = $props();

  let visibleCount = $state(0);
  let typingIndex = $state(-1);
  let typedText = $state("");
  let demoStarted = $state(false);

  onMount(() => {
    let cancelled = false;

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
    }, startDelay);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(t);
    };
  });
</script>

<div class="demo-panel">
  <div class="demo-header">
    <span class="demo-dot" style="background:{headerDotColor};box-shadow:0 0 6px {headerDotColor}"
    ></span>
    <span class="demo-label">{headerLabel}</span>
  </div>
  <div class="demo-body" style="height:{bodyHeight}">
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

<style>
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
</style>
