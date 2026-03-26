<!--
  @component
  Companion/optimizer mode example card with conversation samples.
  Shows a labeled header and a list of player/AI exchange examples.
-->
<script lang="ts">
  import type { ModeExample } from "./types";

  interface Props {
    icon: string;
    label: string;
    color: string;
    examples: ModeExample[];
  }

  let { icon, label, color, examples }: Props = $props();
</script>

<div class="mode-card">
  <div class="mode-header" style="--mode-color:{color}">
    <span class="mode-icon">{icon}</span>
    <span class="mode-label">{label}</span>
  </div>
  <div class="mode-body">
    {#each examples as ex (ex.text)}
      <div class="mode-example">
        <span class="mode-role" class:role-player={ex.role === "player"} class:role-ai={ex.role === "ai"}>
          {ex.role === "player" ? "YOU" : "AI"}
        </span>
        <span class="mode-text">{ex.text}</span>
      </div>
    {/each}
  </div>
</div>

<style>
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
    color: var(--mode-color);
  }

  .mode-label {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--mode-color);
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

  .mode-role {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    min-width: 32px;
    text-align: right;
    flex-shrink: 0;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .role-player {
    color: var(--color-green);
  }

  .role-ai {
    color: var(--color-gold);
  }

  .mode-text {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-text);
  }
</style>
