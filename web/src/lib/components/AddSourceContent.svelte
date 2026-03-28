<!--
  @component
  Shared install instructions + pairing code input.
  Used by both AddSourceModal and EmptySourceState.

  Two-column layout when onapiskip is provided:
    Left:  "Watch Your Saves" — daemon install + pairing code
    Right: "Connect Your Account" — API game picker
  Single-column (daemon-only) when onapiskip is omitted.
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { plugins } from "$lib/stores/plugins";

  import GameIcon from "./GameIcon.svelte";
  import PairingCodeInput from "./PairingCodeInput.svelte";
  import TinyButton from "./TinyButton.svelte";

  let {
    onsubmit,
    onapiskip,
  }: {
    /** Called when user submits the 6-digit pairing code. */
    onsubmit?: (code: string) => void;
    /** Called when user wants to skip daemon install and connect an API game. */
    onapiskip?: () => void;
  } = $props();

  // -- Games from plugin manifest ----------------------------
  let daemonGames = $derived([...$plugins.values()].filter((p) => !p.adapter));
  let apiGames = $derived([...$plugins.values()].filter((p) => !!p.adapter));

  // -- Shared state -----------------------------------------
  let copied = $state<string | null>(null);
  let error = $state<string | null>(null);

  const isStaging = PUBLIC_API_URL.includes("staging");
  const installUrl = isStaging
    ? "https://staging-install.savecraft.gg"
    : "https://install.savecraft.gg";

  function installCommand(): string {
    return `curl -sSL ${installUrl} | bash`;
  }

  async function copyToClipboard(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      setTimeout(() => {
        copied = null;
      }, 2000);
    } catch {
      error = "Failed to copy to clipboard";
    }
  }
</script>

{#if onapiskip}
  <!-- Split layout: daemon on left, API on right -->
  <div class="split">
    <div class="split-left">
      <div class="split-header">
        <span class="split-title">WATCH YOUR SAVES</span>
      </div>
      <p class="split-desc">
        Install the Savecraft daemon to watch local save files and sync automatically.
      </p>
      <div class="split-games">
        {#each daemonGames as plugin (plugin.game_id)}
          <div class="game-tile">
            <GameIcon iconUrl={plugin.icon_url} name={plugin.name} size={44} />
            <span class="game-label">{plugin.name.toUpperCase()}</span>
          </div>
        {/each}
      </div>

      <div class="daemon-steps">
        <!-- Step 1: Install -->
        <div class="step-header">
          <span class="step-number">1</span>
          <span class="step-title">Install</span>
        </div>

        <div class="platform-block">
          <span class="platform-label">WINDOWS</span>
          <div class="action-row">
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external download URL -->
            <a class="primary-action" href={installUrl}>
              <span class="primary-action-icon">&darr;</span>
              <span class="primary-action-label">DOWNLOAD</span>
            </a>
          </div>
          <p class="install-hint">Run the downloaded installer</p>
        </div>

        <div class="platform-block">
          <span class="platform-label">LINUX / STEAM DECK</span>
          <div class="command-block">
            <code class="command-text">{installCommand()}</code>
            <TinyButton
              label={copied === "cmd" ? "COPIED" : "COPY"}
              onclick={() => {
                void copyToClipboard(installCommand(), "cmd");
              }}
            />
          </div>
        </div>

        <!-- Step 2: Pairing code -->
        <div class="step-header">
          <span class="step-number">2</span>
          <span class="step-title">Pair</span>
        </div>
        <p class="step-desc">Enter the 6-digit code from the daemon:</p>
        <PairingCodeInput {onsubmit} />
      </div>
    </div>

    <div class="split-divider"></div>

    <div class="split-right">
      <div class="split-header">
        <span class="split-title">CONNECT YOUR ACCOUNT</span>
      </div>
      <p class="split-desc">
        Link your game account to import characters from the cloud. No install needed.
      </p>
      <div class="split-games">
        {#each apiGames as plugin (plugin.game_id)}
          <div class="game-tile">
            <GameIcon iconUrl={plugin.icon_url} name={plugin.name} size={44} variant="api" />
            <span class="game-label">{plugin.name.toUpperCase()}</span>
          </div>
        {/each}
      </div>

      <button class="api-action" onclick={onapiskip}>
        <span class="api-action-label">BROWSE GAMES</span>
      </button>
    </div>
  </div>
{:else}
  <!-- Single-column daemon-only layout -->
  <div class="section">
    <div class="step-header">
      <span class="step-number">1</span>
      <span class="step-title">Install</span>
    </div>

    <div class="platform-block">
      <span class="platform-label">WINDOWS</span>
      <div class="action-row">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external download URL -->
        <a class="primary-action" href={installUrl}>
          <span class="primary-action-icon">&darr;</span>
          <span class="primary-action-label">DOWNLOAD FOR WINDOWS</span>
        </a>
      </div>
      <p class="install-hint">Run the downloaded installer</p>
    </div>

    <div class="platform-block">
      <span class="platform-label">LINUX / STEAM DECK</span>
      <div class="command-block">
        <code class="command-text">{installCommand()}</code>
        <TinyButton
          label={copied === "cmd" ? "COPIED" : "COPY"}
          onclick={() => {
            void copyToClipboard(installCommand(), "cmd");
          }}
        />
      </div>
      <p class="install-hint">
        Installs to <code>~/.local/bin/</code> &middot; Starts as a systemd service
      </p>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="section">
    <div class="step-header">
      <span class="step-number">2</span>
      <span class="step-title">Enter Pairing Code</span>
    </div>
    <p class="step-desc">After install, enter the 6-digit code shown by the daemon:</p>
    <PairingCodeInput {onsubmit} />
  </div>
{/if}

{#if error}
  <div class="error-msg">{error}</div>
{/if}

<style>
  /* -- Split layout ----------------------------------------- */

  .split {
    display: flex;
    min-height: 0;
  }

  .split-left,
  .split-right {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
  }

  .split-divider {
    width: 1px;
    background: rgba(74, 90, 173, 0.2);
    align-self: stretch;
  }

  .split-header {
    margin-bottom: 8px;
  }

  .split-title {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .split-desc {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .split-games {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
  }

  .game-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 56px;
  }

  .game-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    text-align: center;
    line-height: 1.3;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .daemon-steps {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .api-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    background: rgba(107, 138, 237, 0.08);
    border: 2px solid var(--color-blue, #6b8aed);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 0 12px rgba(107, 138, 237, 0.1);
    align-self: flex-start;
    margin-top: auto;
  }

  .api-action:hover {
    background: rgba(107, 138, 237, 0.15);
    box-shadow: 0 0 20px rgba(107, 138, 237, 0.2);
  }

  .api-action-label {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-blue, #6b8aed);
    letter-spacing: 2px;
  }

  /* -- Single-column sections -------------------------------- */

  .section {
    padding: 18px 20px;
  }

  .section-divider {
    height: 1px;
    background: rgba(74, 90, 173, 0.15);
    margin: 0 20px;
  }

  /* -- Step headers ----------------------------------------- */

  .step-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .step-number {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-gold);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-gold);
    border-radius: 3px;
  }

  .step-title {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-text);
    letter-spacing: 1px;
  }

  .step-desc {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    margin-bottom: 10px;
    line-height: 1.5;
  }

  /* -- Primary action button -------------------------------- */

  .primary-action {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: rgba(200, 168, 78, 0.08);
    border: 2px solid var(--color-gold);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 0 12px rgba(200, 168, 78, 0.1);
  }

  .primary-action:hover:not(:disabled) {
    background: rgba(200, 168, 78, 0.15);
    box-shadow: 0 0 20px rgba(200, 168, 78, 0.2);
  }

  .primary-action:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .primary-action-icon {
    font-family: var(--font-pixel);
    font-size: 16px;
    color: var(--color-gold);
  }

  .primary-action-label {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  /* -- Platform blocks -------------------------------------- */

  .platform-block {
    margin-bottom: 14px;
  }

  .platform-block:last-child {
    margin-bottom: 0;
  }

  .platform-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
    margin-bottom: 8px;
  }

  /* -- Install hint ----------------------------------------- */

  .install-hint {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-muted);
    margin-top: 10px;
  }

  .install-hint code {
    color: var(--color-text-dim);
    font-size: 14px;
  }

  /* -- Command block ---------------------------------------- */

  .command-block {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(5, 7, 26, 0.5);
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.15);
  }

  .command-text {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text);
    word-break: break-all;
    flex: 1;
    line-height: 1.5;
  }

  .error-msg {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-red);
    padding: 8px 20px;
  }
</style>
