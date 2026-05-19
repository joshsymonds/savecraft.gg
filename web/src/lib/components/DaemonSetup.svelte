<!--
  @component
  The canonical "install the daemon, then enter the 6-digit pairing code"
  step. Exactly one install+pair UI in the app: the game picker's
  contextual daemon onboarding and GameDetailModal's "pair a new
  computer" leaf both render this (Req 17c).
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";

  import PairingCodeInput from "./PairingCodeInput.svelte";
  import TinyButton from "./TinyButton.svelte";

  let {
    onpair,
    intro,
  }: {
    onpair?: (code: string) => void;
    /** Optional gold-accented lead-in shown above step 1. */
    intro?: string;
  } = $props();

  let copied = $state(false);

  const installUrl = PUBLIC_API_URL.includes("staging")
    ? "https://staging-install.savecraft.gg"
    : "https://install.savecraft.gg";

  function installCommand(): string {
    return `curl -sSL ${installUrl} | bash`;
  }

  async function copyInstallCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(installCommand());
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard unavailable; the command stays visible to copy by hand.
    }
  }
</script>

<div class="workshop-panel">
  {#if intro}
    <p class="intro-callout">{intro}</p>
  {/if}
  <div class="workshop-step">
    <span class="workshop-step-number">1</span>
    <div class="workshop-step-content">
      <span class="workshop-step-title">Install</span>
      <p class="workshop-step-desc">Windows: download and run the installer.</p>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external download URL -->
      <a class="workshop-button" href={installUrl}>Download</a>
      <p class="workshop-step-desc spacer-top">Linux or Steam Deck: run this.</p>
      <div class="command-block">
        <code class="command-text">{installCommand()}</code>
        <TinyButton
          label={copied ? "COPIED" : "COPY"}
          onclick={() => {
            void copyInstallCommand();
          }}
        />
      </div>
    </div>
  </div>
  <div class="workshop-step">
    <span class="workshop-step-number">2</span>
    <div class="workshop-step-content">
      <span class="workshop-step-title">Pair</span>
      <p class="workshop-step-desc">
        Enter the 6-digit code the daemon shows the first time it runs.
      </p>
      <PairingCodeInput onsubmit={onpair} />
    </div>
  </div>
</div>

<style>
  .workshop-panel {
    padding: 18px;
    display: flex;
    flex-direction: column;
  }

  .intro-callout {
    font-family: var(--font-body);
    font-size: 17px;
    line-height: 1.55;
    color: var(--color-text);
    margin: 0 0 16px;
    padding: 14px 16px;
    background: linear-gradient(90deg, rgba(200, 168, 78, 0.12), rgba(200, 168, 78, 0.03));
    border-left: 3px solid var(--color-gold);
    border-radius: 0 4px 4px 0;
  }

  .workshop-step {
    display: flex;
    gap: 12px;
    padding: 14px 0;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
  }

  .workshop-step:last-child {
    border-bottom: none;
  }

  .workshop-step-number {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-gold);
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-gold);
    border-radius: 3px;
    flex-shrink: 0;
  }

  .workshop-step-content {
    flex: 1;
    min-width: 0;
  }

  .workshop-step-title {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 4px;
  }

  .workshop-step-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.4;
    margin: 0 0 8px;
  }

  .spacer-top {
    margin-top: 12px;
  }

  .command-block {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding: 8px 10px;
    background: rgba(5, 7, 26, 0.5);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
  }

  .command-text {
    flex: 1;
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    color: var(--color-text);
    overflow-x: auto;
    white-space: nowrap;
  }

  .workshop-button {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 10px;
    letter-spacing: 1.5px;
    padding: 8px 14px;
    color: var(--color-text);
    background: rgba(198, 212, 223, 0.12);
    border: 1px solid rgba(198, 212, 223, 0.25);
    border-radius: 3px;
    text-decoration: none;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .workshop-button:hover {
    background: rgba(198, 212, 223, 0.22);
    border-color: rgba(198, 212, 223, 0.4);
  }
</style>
