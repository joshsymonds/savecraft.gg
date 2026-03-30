<!--
  @component
  Displayed while waiting for bridge data to arrive.
  Shows a randomly-selected gaming-themed phrase with a pulsing fade animation
  inside a Panel. Self-contained so it can be mounted directly via mount().
-->
<script lang="ts">
  import Panel from "../layout/Panel.svelte";

  const phrases = [
    "Rolling for initiative\u2026",
    "Parsing save data\u2026",
    "Checking inventory\u2026",
    "Loading last checkpoint\u2026",
    "Consulting the oracle\u2026",
    "Decrypting ancient scrolls\u2026",
    "Scouting ahead\u2026",
    "Reticulating splines\u2026",
    "Sharpening swords\u2026",
    "Attuning to the Weave\u2026",
  ];

  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
</script>

<Panel>
  <div class="loading-state">
    <p class="phrase">{phrase}</p>
  </div>
</Panel>

<style>
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xl) var(--space-lg);
  }

  .phrase {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-align: center;
    animation: pulse-loading 2s ease-in-out infinite;
  }

  @keyframes pulse-loading {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
</style>
