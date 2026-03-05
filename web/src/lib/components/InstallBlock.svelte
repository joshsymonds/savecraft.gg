<!--
  @component
  Install + pairing flow: install command, pairing code entry, API key management.
  prominent=true: full hero treatment (empty state — no sources yet)
  prominent=false: compact collapsible row (below source list)
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { createApiKey, deleteApiKey, listApiKeys } from "$lib/api/client";
  import type { ApiKey, CreateApiKeyResponse } from "$lib/api/client";
  import { Panel, TinyButton } from "$lib/components";
  import { onMount } from "svelte";

  let {
    prominent = true,
    onsubmit,
  }: {
    prominent?: boolean;
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
  const installUrl = isStaging
    ? "https://staging-install.savecraft.gg"
    : "https://install.savecraft.gg";
  const appName = isStaging ? "savecraft-staging" : "savecraft";
  const msiUrl = `${installUrl}/daemon/${appName}.msi`;
  onMount(() => {
    void loadKeys();
  });

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

{#snippet installCommandSection()}
  <div class="section">
    <div class="step-header">
      {#if prominent}<span class="step-number">1</span>{/if}
      <span class="step-title">Install</span>
    </div>

    <!-- Windows -->
    <div class="platform-block">
      <span class="platform-label">WINDOWS</span>
      <div class="action-row">
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external download URL, not SvelteKit navigation -->
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
{/snippet}

{#snippet pairingCodeSection()}
  <div class="section">
    <div class="step-header">
      {#if prominent}<span class="step-number">2</span>{/if}
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
  <!-- Full hero install + pairing flow -->
  <div class="install-hero">
    <div class="hero-header">
      <span class="hero-label">GET STARTED</span>
      <h2 class="hero-title">Connect your gaming machine to Savecraft</h2>
      <p class="hero-subtitle">
        Install the daemon and it starts watching your saves. Takes two minutes.
      </p>
    </div>

    <Panel>
      {@render installCommandSection()}
      <div class="section-divider"></div>
      {@render pairingCodeSection()}
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
    <button class="add-source-toggle" onclick={() => (expanded = !expanded)}>
      <span class="toggle-icon">{expanded ? "-" : "+"}</span>
      <span class="toggle-label">ADD ANOTHER SOURCE</span>
    </button>

    {#if expanded}
      <div class="compact-install">
        {@render installCommandSection()}
        <div class="section-divider"></div>
        {@render pairingCodeSection()}

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
  </Panel>
{/if}

{#if error}
  <div class="error-msg">{error}</div>
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

  /* -- Platform blocks --------------------------------------- */

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

  /* -- Compact (non-prominent) ------------------------------ */

  .add-source-toggle {
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

  .add-source-toggle:hover .toggle-label {
    color: var(--color-text-dim);
  }

  .compact-install {
    border-top: 1px solid rgba(74, 90, 173, 0.12);
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
