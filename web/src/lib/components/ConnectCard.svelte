<!--
  @component
  MCP connect card: prominent CTA when no AI client connected, compact reminder once connected.
-->
<script lang="ts">
  import { PUBLIC_MCP_URL } from "$env/static/public";
  import { fetchMcpStatus } from "$lib/api/client";
  import { Panel } from "$lib/components";
  import { onMount } from "svelte";

  const mcpUrl = PUBLIC_MCP_URL;

  let loading = $state(true);
  let connected = $state(false);
  let copied = $state(false);
  let copyError = $state(false);

  let copyLabel = $derived.by(() => {
    if (copyError) return "FAILED";
    if (copied) return "COPIED!";
    return "COPY URL";
  });

  onMount(async () => {
    try {
      const status = await fetchMcpStatus();
      connected = status.connected;
    } catch {
      // If fetch fails, show the CTA (assume not connected)
      connected = false;
    }
    loading = false;
  });

  async function copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      copied = true;
      copyError = false;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      copyError = true;
      setTimeout(() => {
        copyError = false;
      }, 2000);
    }
  }
</script>

{#if !loading}
  {#if connected}
    <!-- Compact: AI connected -->
    <Panel>
      <div class="compact">
        <div class="compact-status">
          <span class="status-dot"></span>
          <span class="connected-label">AI CONNECTED</span>
        </div>
        <div class="url-block compact-url">
          <code class="url-text">{mcpUrl}</code>
          <button class="copy-btn" onclick={copyUrl}>{copyLabel}</button>
        </div>
      </div>
    </Panel>
  {:else}
    <!-- CTA: connect an AI client -->
    <Panel accent="#e8c44e40">
      <div class="cta">
        <div class="cta-header">
          <span class="cta-badge">SETUP</span>
          <h2 class="cta-title">Give your AI eyes on your saves</h2>
          <p class="cta-subtitle">
            Connect Claude, ChatGPT, or any MCP-compatible assistant. It'll read your game state in
            real time — builds, stats, progress, inventory — and give you advice that actually knows
            what's in your save file.
          </p>
        </div>

        <div class="url-section">
          <span class="url-label">Your MCP server URL</span>
          <div class="url-block">
            <code class="url-text">{mcpUrl}</code>
            <button class="copy-btn" class:copied onclick={copyUrl}>{copyLabel}</button>
          </div>
        </div>

        <div class="instructions">
          <span class="instructions-label">Paste it into your AI client</span>
          <div class="instruction-list">
            <div class="instruction">
              <span class="client-name">Claude.ai</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps"
                >Settings &rarr; Connectors &rarr; Add custom connector</span
              >
            </div>
            <div class="instruction">
              <span class="client-name">Claude Code</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps">
                <code class="inline-code">claude mcp add-remote savecraft {mcpUrl}</code>
              </span>
            </div>
            <div class="instruction">
              <span class="client-name">ChatGPT</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps">Settings &rarr; MCP &rarr; Add remote server</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  {/if}
{/if}

<style>
  /* ── Compact (connected) ────────────────────────────────── */

  .compact {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .compact-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-green);
    box-shadow: 0 0 6px var(--color-green);
  }

  .connected-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-green);
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .compact-url {
    flex: 1;
  }

  /* ── CTA (not connected) ────────────────────────────────── */

  .cta {
    padding: 24px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .cta-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cta-badge {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    letter-spacing: 3px;
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.2);
    border-radius: 3px;
    padding: 4px 10px;
    width: fit-content;
  }

  .cta-title {
    font-family: var(--font-body);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    line-height: 1.3;
  }

  .cta-subtitle {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0;
    max-width: 540px;
  }

  /* ── URL section ─────────────────────────────────────────── */

  .url-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .url-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .url-block {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(5, 7, 26, 0.6);
    padding: 12px 14px;
    border-radius: 4px;
    border: 1px solid rgba(74, 90, 173, 0.2);
  }

  .url-text {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-green);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: all;
  }

  .copy-btn {
    background: rgba(74, 90, 173, 0.12);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 3px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    border-color: var(--color-border-light);
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.2);
  }

  .copy-btn.copied {
    color: var(--color-green);
    border-color: rgba(90, 190, 138, 0.3);
  }

  /* ── Instructions ─────────────────────────────────────────── */

  .instructions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(74, 90, 173, 0.1);
    padding-top: 16px;
  }

  .instructions-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .instruction-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .instruction {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 3px;
    background: rgba(5, 7, 26, 0.3);
  }

  .client-name {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text);
    letter-spacing: 1px;
    min-width: 100px;
    flex-shrink: 0;
  }

  .client-arrow {
    color: var(--color-text-muted);
    font-size: 14px;
  }

  .client-steps {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  .inline-code {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.1);
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.15);
  }
</style>
