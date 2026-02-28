<!--
  @component
  MCP connect card: prominent CTA when no AI client connected, compact reminder once connected.
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { fetchMcpStatus } from "$lib/api/client";
  import { Panel, TinyButton } from "$lib/components";
  import { onMount } from "svelte";

  const mcpUrl = `${PUBLIC_API_URL}/mcp`;

  let loading = $state(true);
  let connected = $state(false);
  let copied = $state(false);
  let copyError = $state(false);

  let copyLabel = $derived.by(() => {
    if (copyError) return "FAILED";
    if (copied) return "COPIED";
    return "COPY";
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
        <span class="connected-label">AI CONNECTED</span>
        <div class="url-block">
          <code class="url-text">{mcpUrl}</code>
          <TinyButton label={copyLabel} onclick={copyUrl} />
        </div>
      </div>
    </Panel>
  {:else}
    <!-- CTA: connect an AI client -->
    <Panel accent="#e8c44e40">
      <div class="cta">
        <div class="cta-header">
          <span class="cta-label">CONNECT AI</span>
          <span class="cta-subtitle">Connect an AI assistant to your game data</span>
        </div>

        <div class="url-block">
          <code class="url-text">{mcpUrl}</code>
          <TinyButton label={copyLabel} onclick={copyUrl} />
        </div>

        <div class="instructions">
          <div class="instruction">
            <span class="client-name">CLAUDE.AI</span>
            <span class="client-steps"
              >Settings → Connectors → Add custom connector → paste URL</span
            >
          </div>
          <div class="instruction">
            <span class="client-name">CLAUDE CODE</span>
            <span class="client-steps">
              <code class="inline-code">claude mcp add-remote savecraft {mcpUrl}</code>
            </span>
          </div>
          <div class="instruction">
            <span class="client-name">CHATGPT</span>
            <span class="client-steps">Settings → MCP → Add remote server → paste URL</span>
          </div>
        </div>
      </div>
    </Panel>
  {/if}
{/if}

<style>
  /* ── Compact (connected) ────────────────────────────────── */

  .compact {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .connected-label {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-green);
    letter-spacing: 2px;
    white-space: nowrap;
  }

  /* ── CTA (not connected) ────────────────────────────────── */

  .cta {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .cta-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cta-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .cta-subtitle {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
  }

  /* ── Shared URL block ───────────────────────────────────── */

  .url-block {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(5, 7, 26, 0.5);
    padding: 10px 12px;
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.15);
    flex: 1;
  }

  .url-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-green);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Instructions ───────────────────────────────────────── */

  .instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .instruction {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 0;
  }

  .client-name {
    font-family: var(--font-pixel);
    font-size: 6px;
    color: var(--color-text);
    letter-spacing: 1px;
    min-width: 90px;
    flex-shrink: 0;
  }

  .client-steps {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
  }

  .inline-code {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.08);
    padding: 2px 6px;
    border-radius: 2px;
    border: 1px solid rgba(74, 90, 173, 0.12);
  }
</style>
