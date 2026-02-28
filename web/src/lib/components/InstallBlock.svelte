<!--
  @component
  Install flow: pairing code (primary), API key management (secondary).
  prominent=true: full hero treatment (empty state)
  prominent=false: compact collapsible row (below device list)
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import {
    createApiKey,
    deleteApiKey,
    generatePairingCode,
    listApiKeys,
  } from "$lib/api/client";
  import type { ApiKey, CreateApiKeyResponse } from "$lib/api/client";
  import { Panel, TinyButton } from "$lib/components";
  import { onMount } from "svelte";

  let { prominent = true }: { prominent?: boolean } = $props();

  // ── Pairing code state ──────────────────────────────────
  type PairingState = "idle" | "generating" | "active" | "expired";
  let pairingState = $state<PairingState>("idle");
  let pairingCode = $state<string | null>(null);
  let expiresAt = $state(0);
  let remainingSeconds = $state(0);

  // ── API key state (secondary) ───────────────────────────
  let generatedKey = $state<CreateApiKeyResponse | null>(null);
  let existingKeys = $state<ApiKey[]>([]);
  let apiKeyLoading = $state(false);
  let showApiKeys = $state(false);

  // ── Shared state ────────────────────────────────────────
  let copied = $state<string | null>(null);
  let error = $state<string | null>(null);
  let expanded = $state(false);

  const serverUrl = PUBLIC_API_URL;
  const installRepo =
    "https://raw.githubusercontent.com/joshsymonds/savecraft.gg/main/install/install.sh";
  const CODE_TTL_SECONDS = 120;

  onMount(() => {
    void loadKeys();
  });

  // Countdown timer — re-runs when pairingState or expiresAt change.
  $effect(() => {
    if (pairingState !== "active") return;

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
      // Ignore — will show empty
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
    return `curl -sSL ${installRepo} | SAVECRAFT_SERVER_URL=${serverUrl} bash`;
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

{#snippet pairingFlow()}
  <div class="section">
    <div class="step-header">
      {#if prominent}<span class="step-number">1</span>{/if}
      <span class="step-title">Pair Your Device</span>
    </div>

    {#if pairingState === "idle"}
      <p class="step-desc">
        Generate a pairing code, then enter it on your machine to connect.
      </p>
      <div class="action-row">
        <TinyButton label="PAIR A DEVICE" onclick={generateCode} />
      </div>
    {:else if pairingState === "generating"}
      <div class="action-row">
        <TinyButton label="GENERATING..." disabled={true} />
      </div>
    {:else if pairingState === "active" && pairingCode}
      <div class="code-display">
        <div class="code-digits">{pairingCode.slice(0, 3)} {pairingCode.slice(3)}</div>
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
  <!-- Full hero install flow -->
  <div class="install-hero">
    <div class="hero-header">
      <span class="hero-label">GET STARTED</span>
      <span class="hero-subtitle">Connect your gaming machine to Savecraft</span>
    </div>

    <Panel>
      {@render pairingFlow()}
    </Panel>

    <Panel>
      {@render installCommandSection()}
    </Panel>

    <Panel>
      <div class="section">
        <div class="step-header">
          <span class="step-number">3</span>
          <span class="step-title">What Happens Next</span>
        </div>
        <ul class="next-steps">
          <li>The daemon installs to <code>~/.local/bin/savecraft-daemon</code></li>
          <li>A systemd user service starts automatically</li>
          <li>The daemon connects to Savecraft and appears on this page</li>
          <li>Configure games from the device card — the daemon watches for save changes</li>
        </ul>
      </div>
    </Panel>

    <Panel>
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
    <button class="add-device-toggle" onclick={() => (expanded = !expanded)}>
      <span class="toggle-icon">{expanded ? "-" : "+"}</span>
      <span class="toggle-label">ADD ANOTHER DEVICE</span>
    </button>

    {#if expanded}
      <div class="compact-install">
        {@render pairingFlow()}
        {@render installCommandSection()}

        <button
          class="api-keys-toggle compact"
          onclick={() => (showApiKeys = !showApiKeys)}
        >
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
  </Panel>
{/if}

<style>
  /* ── Hero (prominent) ───────────────────────────────────── */

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
    gap: 4px;
    margin-bottom: 8px;
  }

  .hero-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .hero-subtitle {
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text-dim);
  }

  /* ── Compact (non-prominent) ────────────────────────────── */

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

  /* ── Pairing code display ───────────────────────────────── */

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

  /* ── API keys toggle ────────────────────────────────────── */

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

  /* ── Shared ─────────────────────────────────────────────── */

  .toggle-icon {
    font-family: var(--font-pixel);
    font-size: 10px;
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
    font-size: 6px;
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
    font-size: 10px;
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
    font-size: 7px;
    color: var(--color-text);
    letter-spacing: 1px;
  }

  .step-desc {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
    margin-bottom: 12px;
    line-height: 1.4;
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

  .next-steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .next-steps li {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
    padding-left: 16px;
    position: relative;
  }

  .next-steps li::before {
    content: ">";
    position: absolute;
    left: 0;
    color: var(--color-gold);
    font-family: var(--font-pixel);
    font-size: 7px;
    top: 4px;
  }

  .next-steps code {
    color: var(--color-text);
    font-size: 16px;
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
