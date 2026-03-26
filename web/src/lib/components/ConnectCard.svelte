<!--
  @component
  AI connect card: compact CTA when no AI client connected, compact status once connected.
  When not connected, shows a pulsing gold border with URL + copy button and link to docs.

  Pass `initialState` to bypass API calls and show a specific visual state (for Storybook).
-->
<script lang="ts">
  import { PUBLIC_MCP_URL } from "$env/static/public";
  import { fetchMcpStatus } from "$lib/api/client";
  import { Panel } from "$lib/components";
  import { onDestroy, onMount } from "svelte";

  let {
    initialState,
  }: {
    initialState?: { connected: boolean };
  } = $props();

  const mcpUrl = PUBLIC_MCP_URL;

  let loading = $state(true);
  let connected = $state(false);
  let copied = $state(false);
  let copyError = $state(false);

  $effect.pre(() => {
    if (!initialState) return;
    loading = false;
    connected = initialState.connected;
  });

  let copyLabel = $derived.by(() => {
    if (copyError) return "FAILED";
    if (copied) return "COPIED!";
    return "COPY URL";
  });

  onMount(async () => {
    if (initialState) return;
    try {
      const status = await fetchMcpStatus();
      connected = status.connected;
    } catch {
      connected = false;
    }
    loading = false;
  });

  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyUrl(): Promise<void> {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(mcpUrl);
      copied = true;
      copyError = false;
      copyTimer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      copyError = true;
      copyTimer = setTimeout(() => {
        copyError = false;
      }, 2000);
    }
  }

  onDestroy(() => clearTimeout(copyTimer));
</script>

{#if !loading}
  {#if connected}
    <Panel>
      <div class="row">
        <div class="status">
          <span class="status-dot connected"></span>
          <span class="label connected-label">AI CONNECTED</span>
        </div>
        <div class="url-block">
          <code class="url-text">{mcpUrl}</code>
          <button class="copy-btn" class:copied onclick={copyUrl}>{copyLabel}</button>
        </div>
      </div>
      <div class="post-connect-hint">
        Open Claude or ChatGPT and ask about your game &mdash; it can read your saves.
      </div>
    </Panel>
  {:else}
    <div class="cta-wrapper">
      <Panel accent="#e8c44e40">
        <div class="explainer">
          <p class="explainer-text">
            Savecraft connects your game saves to AI assistants like Claude and ChatGPT.
          </p>
          <div class="flow-diagram">
            <span class="flow-step">&#x1F3AE; You play</span>
            <span class="flow-arrow">&rarr;</span>
            <span class="flow-step">&#x26A1; Savecraft syncs</span>
            <span class="flow-arrow">&rarr;</span>
            <span class="flow-step">&#x1F916; AI reads</span>
          </div>
        </div>

        <div class="row">
          <div class="status">
            <span class="status-dot pending"></span>
            <span class="label cta-label">NEXT: CONNECT AI</span>
          </div>
          <div class="url-block url-block-cta">
            <code class="url-text">{mcpUrl}</code>
            <button class="copy-btn copy-btn-cta" class:copied onclick={copyUrl}>{copyLabel}</button
            >
          </div>
        </div>

        <div class="docs-hint">
          Copy the URL above and paste it into Claude or ChatGPT.
          <a href="https://savecraft.gg/docs" class="docs-link" target="_blank" rel="noopener"
            >Step-by-step guide &rarr;</a
          >
        </div>
      </Panel>
    </div>
  {/if}
{/if}

<style>
  /* -- Pulsing wrapper for CTA state -------------------------- */

  .cta-wrapper {
    animation: pulse-border 3s ease-in-out infinite;
    border-radius: 6px;
  }

  @keyframes pulse-border {
    0%,
    100% {
      box-shadow:
        0 0 0 1px rgba(200, 168, 78, 0.15),
        0 0 8px rgba(200, 168, 78, 0.06);
    }
    50% {
      box-shadow:
        0 0 0 1px rgba(200, 168, 78, 0.4),
        0 0 16px rgba(200, 168, 78, 0.12);
    }
  }

  /* -- Explainer block ---------------------------------------- */

  .explainer {
    padding: 16px 18px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .explainer-text {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    margin: 0;
    line-height: 1.4;
  }

  .flow-diagram {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(5, 7, 26, 0.4);
    border-radius: 4px;
    border: 1px solid rgba(200, 168, 78, 0.12);
  }

  .flow-step {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-text);
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .flow-arrow {
    color: var(--color-gold);
    font-size: 16px;
    flex-shrink: 0;
  }

  /* -- Post-connect hint -------------------------------------- */

  .post-connect-hint {
    padding: 0 18px 14px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.4;
  }

  /* -- Shared row layout -------------------------------------- */

  .row {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.connected {
    background: var(--color-green);
    box-shadow: 0 0 6px var(--color-green);
  }

  .status-dot.pending {
    background: var(--color-gold);
    box-shadow: 0 0 6px rgba(200, 168, 78, 0.4);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  .label {
    font-family: var(--font-pixel);
    font-size: 14px;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .connected-label {
    color: var(--color-green);
  }

  .cta-label {
    color: var(--color-gold);
  }

  /* -- URL block ---------------------------------------------- */

  .url-block {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(5, 7, 26, 0.6);
    padding: 10px 14px;
    border-radius: 4px;
    border: 1px solid rgba(74, 90, 173, 0.2);
    min-width: 0;
  }

  .url-block-cta {
    border-color: rgba(200, 168, 78, 0.2);
  }

  .url-text {
    font-family: var(--font-body);
    font-size: 16px;
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
    padding: 8px 16px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 12px;
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

  .copy-btn-cta {
    border-color: rgba(200, 168, 78, 0.3);
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.08);
  }

  .copy-btn-cta:hover {
    border-color: var(--color-gold);
    background: rgba(200, 168, 78, 0.15);
    color: var(--color-gold);
  }

  /* -- Docs hint ---------------------------------------------- */

  .docs-hint {
    padding: 0 18px 14px;
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .docs-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
    white-space: nowrap;
  }

  .docs-link:hover {
    border-color: var(--color-gold);
  }
</style>
