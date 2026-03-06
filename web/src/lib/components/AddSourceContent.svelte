<!--
  @component
  Shared install instructions + pairing code input.
  Used by both AddSourceModal and EmptySourceState.
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";

  import TinyButton from "./TinyButton.svelte";

  let {
    onsubmit,
  }: {
    /** Called when user submits the 6-digit pairing code. */
    onsubmit?: (code: string) => void;
  } = $props();

  // -- Pairing code state -----------------------------------
  let codeValue = $state("");

  function handleCodeSubmit(): void {
    const trimmed = codeValue.trim();
    if (trimmed.length >= 6) {
      onsubmit?.(trimmed);
      codeValue = "";
    }
  }

  function handleCodeKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      handleCodeSubmit();
    }
  }

  // -- Shared state -----------------------------------------
  let copied = $state<string | null>(null);
  let error = $state<string | null>(null);

  const isStaging = PUBLIC_API_URL.includes("staging");
  const installUrl = isStaging
    ? "https://staging-install.savecraft.gg"
    : "https://install.savecraft.gg";
  const appName = isStaging ? "savecraft-staging" : "savecraft";
  const msiUrl = `${installUrl}/daemon/${appName}.msi`;

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

<!-- Step 1: Install -->
<div class="section">
  <div class="step-header">
    <span class="step-number">1</span>
    <span class="step-title">Install</span>
  </div>

  <!-- Windows -->
  <div class="platform-block">
    <span class="platform-label">WINDOWS</span>
    <div class="action-row">
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external download URL -->
      <a class="primary-action" href={msiUrl} download="savecraft.msi">
        <span class="primary-action-icon">&darr;</span>
        <span class="primary-action-label">DOWNLOAD FOR WINDOWS</span>
      </a>
    </div>
    <p class="install-hint">
      Installs to <code>Program Files</code> &middot; Starts on login
    </p>
  </div>

  <!-- Linux / Steam Deck -->
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

<!-- Step 2: Pairing code -->
<div class="section">
  <div class="step-header">
    <span class="step-number">2</span>
    <span class="step-title">Enter Pairing Code</span>
  </div>
  <p class="step-desc">After install, enter the 6-digit code shown by the daemon:</p>
  <div class="pairing-row">
    <input
      type="text"
      class="code-input"
      placeholder="000000"
      maxlength={6}
      bind:value={codeValue}
      onkeydown={handleCodeKeydown}
    />
    <button class="pair-btn" onclick={handleCodeSubmit} disabled={codeValue.trim().length < 6}>
      PAIR
    </button>
  </div>
</div>

{#if error}
  <div class="error-msg">{error}</div>
{/if}

<style>
  /* -- Sections --------------------------------------------- */

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
    font-size: 12px;
    color: var(--color-gold);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-gold);
    border-radius: 3px;
  }

  .step-title {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 1px;
  }

  .step-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    margin-bottom: 12px;
    line-height: 1.5;
  }

  /* -- Primary action button -------------------------------- */

  .primary-action {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 28px;
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
    font-size: 14px;
    color: var(--color-gold);
  }

  .primary-action-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  /* -- Platform blocks -------------------------------------- */

  .platform-block {
    margin-bottom: 18px;
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
    margin-bottom: 10px;
  }

  /* -- Install hint ----------------------------------------- */

  .install-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-top: 10px;
  }

  .install-hint code {
    color: var(--color-text-dim);
    font-size: 12px;
  }

  /* -- Pairing code input ----------------------------------- */

  .pairing-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .code-input {
    font-family: var(--font-pixel);
    font-size: 16px;
    letter-spacing: 6px;
    color: var(--color-text);
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    padding: 10px 14px;
    width: 150px;
    text-align: center;
    outline: none;
    transition: border-color 0.15s;
  }

  .code-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.4;
    letter-spacing: 6px;
  }

  .code-input:focus {
    border-color: var(--color-gold);
  }

  .pair-btn {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 3px;
    padding: 10px 22px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .pair-btn:hover:not(:disabled) {
    background: rgba(200, 168, 78, 0.2);
    border-color: var(--color-gold);
  }

  .pair-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* -- Command block ---------------------------------------- */

  .command-block {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(5, 7, 26, 0.5);
    padding: 10px 12px;
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
