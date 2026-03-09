<!--
  @component
  AI connect card: compact CTA when no AI client connected, compact status once connected.
  When not connected, shows a pulsing gold border and expands instructions by default on first visit.

  Pass `initialState` to bypass API calls and show a specific visual state (for Storybook).
  Pass `initialExpanded` to control initial expand state (for Storybook).
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { PUBLIC_MCP_URL } from "$env/static/public";
  import { fetchMcpStatus } from "$lib/api/client";
  import { Panel } from "$lib/components";
  import { onMount } from "svelte";

  const DISMISSED_KEY = "savecraft:mcpHowDismissed";

  let {
    initialState,
    initialExpanded,
  }: {
    initialState?: { connected: boolean };
    initialExpanded?: boolean;
  } = $props();

  const mcpUrl = PUBLIC_MCP_URL;

  let loading = $state(true);
  let connected = $state(false);
  let copied = $state(false);
  let copyError = $state(false);

  // Expand by default on first visit; once user collapses, remember via sessionStorage
  // svelte-ignore state_referenced_locally
  let expanded = $state(
    initialExpanded ?? (browser ? !sessionStorage.getItem(DISMISSED_KEY) : true),
  );

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

  function toggleExpand(): void {
    expanded = !expanded;
    if (!expanded && browser) {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    }
  }
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
        Open Claude, ChatGPT, or Gemini and ask about your game &mdash; it can read your saves.
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
            <span class="flow-step">🎮 You play</span>
            <span class="flow-arrow">&rarr;</span>
            <span class="flow-step">⚡ Savecraft syncs</span>
            <span class="flow-arrow">&rarr;</span>
            <span class="flow-step">🤖 AI reads</span>
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
          <button class="expand-btn" onclick={toggleExpand}>
            {expanded ? "HIDE" : "HOW?"}
          </button>
        </div>

        {#if expanded}
          <div class="details">
            <span class="details-hint">Paste this URL into your AI client:</span>
            <div class="detail-row">
              <span class="client-name">Claude.ai</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps"
                >Settings &rarr; Connectors &rarr; Add custom connector</span
              >
            </div>
            <div class="detail-row">
              <span class="client-name">Claude Code</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps">
                <code class="inline-code">claude mcp add-remote savecraft {mcpUrl}</code>
              </span>
            </div>
            <div class="detail-row">
              <span class="client-name">ChatGPT</span>
              <span class="client-arrow">&rarr;</span>
              <span class="client-steps">Settings &rarr; Connections &rarr; Add remote server</span>
            </div>
          </div>
        {/if}
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
    font-size: 15px;
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
    font-size: 11px;
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
    font-size: 14px;
    color: var(--color-text-muted);
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
    font-size: 12px;
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
    padding: 6px 14px;
    cursor: pointer;
    font-family: var(--font-pixel);
    font-size: 10px;
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

  /* -- Expand button ------------------------------------------ */

  .expand-btn {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    background: none;
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 6px 12px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    border-color: var(--color-border-light);
    color: var(--color-text-dim);
  }

  /* -- Expandable details ------------------------------------- */

  .details {
    padding: 0 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: fade-in 0.15s ease-out;
  }

  .details-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .detail-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 3px;
    background: rgba(5, 7, 26, 0.3);
  }

  .client-name {
    font-family: var(--font-pixel);
    font-size: 11px;
    color: var(--color-text);
    letter-spacing: 1px;
    min-width: 110px;
    flex-shrink: 0;
  }

  .client-arrow {
    color: var(--color-text-muted);
    font-size: 14px;
  }

  .client-steps {
    font-family: var(--font-body);
    font-size: 15px;
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
