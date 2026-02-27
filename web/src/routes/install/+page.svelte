<!--
  @component
  Install page: generate API key, show install command.
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { Panel, TinyButton } from "$lib/components";
  import { createApiKey, listApiKeys, deleteApiKey } from "$lib/api/client";
  import type { ApiKey, CreateApiKeyResponse } from "$lib/api/client";
  import { onMount } from "svelte";

  let generatedKey = $state<CreateApiKeyResponse | null>(null);
  let existingKeys = $state<ApiKey[]>([]);
  let loading = $state(false);
  let copied = $state<string | null>(null);
  let error = $state<string | null>(null);

  const serverUrl = PUBLIC_API_URL;
  const installRepo = "https://raw.githubusercontent.com/joshsymonds/savecraft.gg/main/install/install.sh";

  onMount(() => {
    void loadKeys();
  });

  async function loadKeys(): Promise<void> {
    try {
      existingKeys = await listApiKeys();
    } catch {
      // Ignore — will show empty
    }
  }

  async function generate(): Promise<void> {
    loading = true;
    error = null;
    try {
      generatedKey = await createApiKey("daemon");
      await loadKeys();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to generate key";
    } finally {
      loading = false;
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

  function installCommand(key: string): string {
    return `curl -sSL ${installRepo} | SAVECRAFT_AUTH_TOKEN=${key} SAVECRAFT_SERVER_URL=${serverUrl} bash`;
  }

  async function copyToClipboard(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      setTimeout(() => { copied = null; }, 2000);
    } catch {
      error = "Failed to copy to clipboard";
    }
  }
</script>

<div class="install-page">
  <div class="page-header">
    <span class="page-label">INSTALL</span>
    <span class="page-subtitle">Set up the Savecraft daemon on your machine</span>
  </div>

  <!-- Step 1: Generate API Key -->
  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">1</span>
        <span class="step-title">Generate API Key</span>
      </div>

      {#if generatedKey}
        <div class="key-display">
          <div class="key-warning">Copy this key now — it won't be shown again.</div>
          <div class="key-row">
            <code class="key-value">{generatedKey.key}</code>
            <TinyButton
              label={copied === "key" ? "COPIED" : "COPY"}
              onclick={() => copyToClipboard(generatedKey!.key, "key")}
            />
          </div>
        </div>
      {:else}
        <p class="step-desc">
          The daemon uses an API key to authenticate with Savecraft.
          Generate one to get started.
        </p>
        <div class="action-row">
          <TinyButton label={loading ? "GENERATING..." : "GENERATE KEY"} onclick={generate} disabled={loading} />
        </div>
      {/if}

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}
    </div>
  </Panel>

  <!-- Step 2: Install Command -->
  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">2</span>
        <span class="step-title">Install Daemon</span>
      </div>

      {#if generatedKey}
        <p class="step-desc">Run this command on your Linux machine or Steam Deck:</p>
        <div class="command-block">
          <code class="command-text">{installCommand(generatedKey.key)}</code>
          <TinyButton
            label={copied === "cmd" ? "COPIED" : "COPY"}
            onclick={() => copyToClipboard(installCommand(generatedKey!.key), "cmd")}
          />
        </div>
      {:else}
        <p class="step-desc step-disabled">Generate an API key first, then the install command will appear here.</p>
      {/if}
    </div>
  </Panel>

  <!-- Step 3: What happens next -->
  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">3</span>
        <span class="step-title">What Happens Next</span>
      </div>
      <ul class="next-steps">
        <li>The daemon installs to <code>~/.local/bin/savecraft-daemon</code></li>
        <li>A systemd user service starts automatically</li>
        <li>The daemon connects to Savecraft and appears on your dashboard</li>
        <li>Configure games from the dashboard — the daemon watches for save changes</li>
      </ul>
    </div>
  </Panel>

  <!-- Existing Keys -->
  {#if existingKeys.length > 0}
    <Panel>
      <div class="section">
        <div class="step-header">
          <span class="step-title">Your API Keys</span>
        </div>
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
    </Panel>
  {/if}
</div>

<style>
  .install-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .page-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .page-subtitle {
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text-dim);
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

  .step-disabled {
    color: var(--color-text-muted);
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
