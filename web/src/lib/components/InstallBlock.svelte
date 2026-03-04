<!--
  @component
  Install flow: pairing code (primary), API key management (secondary).
  prominent=true: full hero treatment (empty state)
  prominent=false: compact collapsible row (below device list)

  Pass `initialState` to bypass API calls and seed reactive state (for Storybook).
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { createApiKey, deleteApiKey, generatePairingCode, listApiKeys } from "$lib/api/client";
  import type { ApiKey, CreateApiKeyResponse } from "$lib/api/client";
  import { Panel, TinyButton } from "$lib/components";
  import { detectOS } from "$lib/platform";
  import { devices } from "$lib/stores/devices";
  import { onMount } from "svelte";

  // -- Pairing code state ------------------------------------
  type PairingState = "idle" | "generating" | "active" | "expired" | "claimed";

  let {
    prominent = true,
    initialState,
  }: {
    prominent?: boolean;
    initialState?: { pairingState: PairingState; pairingCode?: string; remainingSeconds?: number };
  } = $props();

  let pairingState = $state<PairingState>("idle");
  let pairingCode = $state<string | null>(null);
  let expiresAt = $state(0);
  let remainingSeconds = $state(0);

  $effect.pre(() => {
    if (!initialState) return;
    pairingState = initialState.pairingState;
    pairingCode = initialState.pairingCode ?? null;
    remainingSeconds = initialState.remainingSeconds ?? 0;
  });

  // -- API key state (secondary) -----------------------------
  let generatedKey = $state<CreateApiKeyResponse | null>(null);
  let existingKeys = $state<ApiKey[]>([]);
  let apiKeyLoading = $state(false);
  let showApiKeys = $state(false);

  // -- Shared state ------------------------------------------
  let copied = $state<string | null>(null);
  let error = $state<string | null>(null);
  let expanded = $state(false);

  const isStaging = PUBLIC_API_URL.includes("staging");
  const installUrl = isStaging ? "https://install-staging.savecraft.gg" : "https://install.savecraft.gg";
  const appName = isStaging ? "savecraft-staging" : "savecraft";
  const msiUrl = `${installUrl}/daemon/${appName}.msi`;
  const os = detectOS();
  const CODE_TTL_SECONDS = 1200;

  onMount(() => {
    if (initialState) return;
    void loadKeys();
  });

  // Countdown timer -- re-runs when pairingState or expiresAt change.
  $effect(() => {
    if (pairingState !== "active") return;
    if (initialState) return; // Static display in Storybook

    const target = expiresAt;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, target - now);
      remainingSeconds = remaining;

      if (remaining <= 0) {
        pairingState = "expired";
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  });

  // Device connection detection — when a device appears while code is active, celebrate.
  // knownDeviceCount is intentionally non-reactive to avoid re-triggering the effect.
  let knownDeviceCount = -1;

  $effect(() => {
    if (initialState) return;
    const count = $devices.length;

    if (pairingState === "active" && knownDeviceCount >= 0 && count > knownDeviceCount) {
      pairingState = "claimed";
    }

    knownDeviceCount = count;
  });

  function dismiss(): void {
    pairingState = "idle";
    pairingCode = null;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins)}:${secs.toString().padStart(2, "0")}`;
  }

  async function generateCode(): Promise<void> {
    pairingState = "generating";
    error = null;
    try {
      const result = await generatePairingCode();
      pairingCode = result.code;
      expiresAt = Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;
      remainingSeconds = CODE_TTL_SECONDS;
      pairingState = "active";
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to generate pairing code";
      pairingState = "idle";
    }
  }

  async function loadKeys(): Promise<void> {
    try {
      existingKeys = await listApiKeys();
    } catch {
      // Ignore -- will show empty
    }
  }

  async function generateApiKey(): Promise<void> {
    apiKeyLoading = true;
    error = null;
    try {
      generatedKey = await createApiKey("daemon");
      await loadKeys();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to generate key";
    } finally {
      apiKeyLoading = false;
    }
  }

  async function revoke(keyId: string): Promise<void> {
    try {
      await deleteApiKey(keyId);
      await loadKeys();
      if (generatedKey?.id === keyId) generatedKey = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to revoke key";
    }
  }

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

{#snippet claimedFlow()}
  <div class="claimed-section">
    <span class="claimed-stars">&#10038; &#10038; &#10038;</span>
    <span class="claimed-banner">DEVICE CONNECTED</span>
    <p class="claimed-desc">Your daemon is online and watching for saves.</p>
    <div class="claimed-actions">
      <TinyButton label="PAIR ANOTHER" onclick={dismiss} />
    </div>
  </div>
{/snippet}

{#snippet pairingFlow()}
  <div class="section">
    <div class="step-header">
      {#if prominent}<span class="step-number">1</span>{/if}
      <span class="step-title">Pair Your Device</span>
    </div>

    {#if pairingState === "idle"}
      <p class="step-desc">Generate a pairing code, then enter it on your machine to connect.</p>
      <div class="action-row">
        {#if prominent}
          <button class="primary-action" onclick={generateCode}>
            <span class="primary-action-icon">&gt;</span>
            <span class="primary-action-label">PAIR A DEVICE</span>
          </button>
        {:else}
          <TinyButton label="PAIR A DEVICE" onclick={generateCode} />
        {/if}
      </div>
    {:else if pairingState === "generating"}
      <div class="action-row">
        {#if prominent}
          <button class="primary-action" disabled>
            <span class="primary-action-label">GENERATING...</span>
          </button>
        {:else}
          <TinyButton label="GENERATING..." disabled={true} />
        {/if}
      </div>
    {:else if pairingState === "active" && pairingCode}
      <div class="code-display">
        <div class="code-top-row">
          <div class="code-digits">{pairingCode.slice(0, 3)} {pairingCode.slice(3)}</div>
          <TinyButton
            label={copied === "code" ? "COPIED" : "COPY"}
            onclick={() => {
              if (pairingCode) void copyToClipboard(pairingCode, "code");
            }}
          />
        </div>
        <div class="code-timer">
          <span class="timer-label">Expires in</span>
          <span class="timer-value">{formatTime(remainingSeconds)}</span>
        </div>
      </div>
      <p class="code-hint">Enter this code when the installer prompts you.</p>
    {:else if pairingState === "expired"}
      <div class="code-expired">
        <span class="expired-text">Code expired</span>
        <TinyButton label="GET NEW CODE" onclick={generateCode} />
      </div>
    {/if}

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}
  </div>
{/snippet}

{#snippet installCommandSection()}
  <div class="section">
    <div class="step-header">
      {#if prominent}<span class="step-number">2</span>{/if}
      <span class="step-title">Install Daemon</span>
    </div>
    {#if os === "windows"}
      <p class="step-desc">Download and install Savecraft for Windows:</p>
      <div class="action-row">
        <a class="primary-action" href={msiUrl}>
          <span class="primary-action-icon">&darr;</span>
          <span class="primary-action-label">DOWNLOAD FOR WINDOWS</span>
        </a>
      </div>
      <p class="command-hint">After install, enter your pairing code in the system tray app.</p>
    {:else}
      <p class="step-desc">Run this command on your Linux machine or Steam Deck:</p>
      <div class="command-block">
        <code class="command-text">{installCommand()}</code>
        <TinyButton
          label={copied === "cmd" ? "COPIED" : "COPY"}
          onclick={() => {
            void copyToClipboard(installCommand(), "cmd");
          }}
        />
      </div>
      <p class="command-hint">The installer will prompt you for the pairing code.</p>
    {/if}
  </div>
{/snippet}

{#snippet nextStepsSection()}
  <div class="section next-steps-section">
    <div class="step-header">
      <span class="step-number">3</span>
      <span class="step-title">What Happens Next</span>
    </div>
    <div class="next-steps-inline">
      {#if os === "windows"}
        <span class="next-step-item">Installs to <code>Program Files</code></span>
        <span class="next-step-sep">&middot;</span>
        <span class="next-step-item">Starts on login</span>
      {:else}
        <span class="next-step-item">Installs to <code>~/.local/bin/</code></span>
        <span class="next-step-sep">&middot;</span>
        <span class="next-step-item">Starts as a systemd service</span>
      {/if}
      <span class="next-step-sep">&middot;</span>
      <span class="next-step-item">Appears on this page automatically</span>
    </div>
  </div>
{/snippet}

{#snippet apiKeysSection()}
  <div class="section">
    {#if generatedKey}
      {@const currentKey = generatedKey.key}
      <div class="key-display">
        <div class="key-warning">Copy this key now — it won't be shown again.</div>
        <div class="key-row">
          <code class="key-value">{currentKey}</code>
          <TinyButton
            label={copied === "key" ? "COPIED" : "COPY"}
            onclick={() => {
              void copyToClipboard(currentKey, "key");
            }}
          />
        </div>
      </div>
    {:else}
      <p class="step-desc">For headless or automated setups, use an API key instead of pairing.</p>
      <div class="action-row">
        <TinyButton
          label={apiKeyLoading ? "GENERATING..." : "GENERATE KEY"}
          onclick={generateApiKey}
          disabled={apiKeyLoading}
        />
      </div>
    {/if}
  </div>

  {#if existingKeys.length > 0}
    <div class="section">
      <div class="keys-list">
        {#each existingKeys as apiKey (apiKey.id)}
          <div class="key-item">
            <div class="key-info">
              <code class="key-prefix">{apiKey.prefix}...</code>
              <span class="key-label">{apiKey.label}</span>
              <span class="key-date">{new Date(apiKey.created_at).toLocaleDateString()}</span>
            </div>
            <TinyButton label="REVOKE" onclick={() => revoke(apiKey.id)} />
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#if prominent}
  <!-- Full hero install flow — single consolidated Panel -->
  <div class="install-hero">
    <div class="hero-header">
      <span class="hero-label">GET STARTED</span>
      <h2 class="hero-title">Connect your gaming machine to Savecraft</h2>
      <p class="hero-subtitle">
        {#if os === "windows"}
          Pair your device, download the installer, and the daemon starts watching your saves. Takes
          two minutes.
        {:else}
          Pair your device, run one command, and the daemon starts watching your saves. Takes two
          minutes.
        {/if}
      </p>
    </div>

    <Panel>
      {@render pairingFlow()}
      <div class="section-divider"></div>
      {@render installCommandSection()}
      <div class="section-divider"></div>
      {@render nextStepsSection()}
      <div class="section-divider faint"></div>
      <button class="api-keys-toggle" onclick={() => (showApiKeys = !showApiKeys)}>
        <span class="toggle-icon">{showApiKeys ? "-" : "+"}</span>
        <span class="toggle-label">API KEYS (FOR AUTOMATION)</span>
      </button>
      {#if showApiKeys}
        <div class="api-keys-content">
          {@render apiKeysSection()}
        </div>
      {/if}
    </Panel>
  </div>
{:else}
  <!-- Compact collapsible row -->
  <Panel>
    {#if pairingState === "claimed"}
      {@render claimedFlow()}
    {:else}
      <button class="add-device-toggle" onclick={() => (expanded = !expanded)}>
        <span class="toggle-icon">{expanded ? "-" : "+"}</span>
        <span class="toggle-label">ADD ANOTHER DEVICE</span>
      </button>

      {#if expanded}
        <div class="compact-install">
          {@render pairingFlow()}
          {@render installCommandSection()}

          <button class="api-keys-toggle compact" onclick={() => (showApiKeys = !showApiKeys)}>
            <span class="toggle-icon">{showApiKeys ? "-" : "+"}</span>
            <span class="toggle-label">API KEYS (FOR AUTOMATION)</span>
          </button>
          {#if showApiKeys}
            <div class="api-keys-content">
              {@render apiKeysSection()}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </Panel>
{/if}

<style>
  /* -- Hero (prominent) ------------------------------------- */

  .install-hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 0;
  }

  .hero-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .hero-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .hero-title {
    font-family: var(--font-body);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    line-height: 1.3;
  }

  .hero-subtitle {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0;
    max-width: 480px;
  }

  /* -- Section dividers inside the consolidated Panel ------- */

  .section-divider {
    height: 1px;
    background: rgba(74, 90, 173, 0.15);
    margin: 0 20px;
  }

  .section-divider.faint {
    background: rgba(74, 90, 173, 0.08);
  }

  /* -- Primary action button (hero only) -------------------- */

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

  /* -- "What happens next" inline section ------------------- */

  .next-steps-section {
    padding-bottom: 14px;
  }

  .next-steps-inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .next-step-item {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .next-step-item code {
    color: var(--color-text-dim);
    font-size: 13px;
  }

  .next-step-sep {
    color: rgba(74, 90, 173, 0.3);
    font-size: 14px;
  }

  /* -- Claimed / celebration -------------------------------- */

  .claimed-section {
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }

  .claimed-stars {
    font-size: 14px;
    color: var(--color-gold);
    letter-spacing: 6px;
    text-shadow: 0 0 10px rgba(200, 168, 78, 0.4);
  }

  .claimed-banner {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-green);
    letter-spacing: 3px;
    text-shadow: 0 0 12px rgba(90, 190, 138, 0.4);
  }

  .claimed-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    margin: 0;
  }

  .claimed-actions {
    margin-top: 8px;
  }

  /* -- Compact (non-prominent) ------------------------------ */

  .add-device-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .add-device-toggle:hover .toggle-label {
    color: var(--color-text-dim);
  }

  .compact-install {
    border-top: 1px solid rgba(74, 90, 173, 0.12);
  }

  /* -- Pairing code display --------------------------------- */

  .code-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: rgba(5, 7, 26, 0.5);
    border-radius: 4px;
    border: 1px solid rgba(74, 90, 173, 0.15);
  }

  .code-top-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .code-digits {
    font-family: var(--font-body);
    font-size: 48px;
    letter-spacing: 8px;
    color: var(--color-gold);
    font-variant-numeric: tabular-nums;
  }

  .code-timer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .timer-label {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .timer-value {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .code-hint {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-muted);
    margin-top: 8px;
  }

  .code-expired {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .expired-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .command-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin-top: 8px;
  }

  /* -- API keys toggle -------------------------------------- */

  .api-keys-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .api-keys-toggle.compact {
    border-top: 1px solid rgba(74, 90, 173, 0.12);
  }

  .api-keys-toggle:hover .toggle-label {
    color: var(--color-text-dim);
  }

  .api-keys-content {
    border-top: 1px solid rgba(74, 90, 173, 0.12);
  }

  /* -- Shared ----------------------------------------------- */

  .toggle-icon {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
  }

  .toggle-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
  }

  .section {
    padding: 18px 20px;
  }

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

  .action-row {
    display: flex;
    gap: 8px;
  }

  .key-display {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .key-warning {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-yellow);
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(5, 7, 26, 0.5);
    padding: 8px 12px;
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.15);
  }

  .key-value {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-green);
    word-break: break-all;
    flex: 1;
  }

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
    margin-top: 8px;
  }

  .keys-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .key-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: rgba(5, 7, 26, 0.3);
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.08);
  }

  .key-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .key-prefix {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
  }

  .key-label {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
  }

  .key-date {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
