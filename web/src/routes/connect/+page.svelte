<!--
  @component
  Public help page for users who pasted their connector URL into a browser.
  Shows the actual MCP URL with copy button and links to docs for detailed setup.
  No auth required. Also serves as an LLM-readable reference.
-->
<script lang="ts">
  import { PUBLIC_MCP_URL } from "$env/static/public";
  import { onDestroy } from "svelte";

  const mcpUrl = PUBLIC_MCP_URL;

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyUrl(): Promise<void> {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(mcpUrl);
      copied = true;
      copyTimer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard API not available — user can still select the text
    }
  }

  onDestroy(() => clearTimeout(copyTimer));
</script>

<svelte:head>
  <title>Connect — Savecraft</title>
  <meta property="og:title" content="Savecraft — Game Save Connector for AI" />
  <meta
    property="og:description"
    content="This URL connects your game saves to AI assistants like Claude and ChatGPT. Add it in your AI app's settings — not in the chat."
  />
  <meta property="og:url" content="https://my.savecraft.gg/connect" />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="connect-page">
  <div class="content">
    <!-- Hero -->
    <div class="hero">
      <div class="logo">SAVECRAFT</div>
      <h1 class="title">Your connector URL</h1>
      <p class="subtitle">
        Copy this URL and paste it into your AI app's <strong>settings</strong> &mdash; not in the
        chat or browser.
      </p>
    </div>

    <!-- URL block with copy -->
    <div class="url-section">
      <div class="url-row">
        <code class="url-text">{mcpUrl}</code>
        <button class="copy-btn" class:copied onclick={copyUrl}>
          {copied ? "COPIED!" : "COPY"}
        </button>
      </div>
    </div>

    <!-- Quick setup hints -->
    <div class="instructions">
      <h2 class="section-label">QUICK SETUP</h2>

      <div class="client-hint">
        <span class="client-name">Claude.ai</span>
        <span class="client-steps">
          Settings &rarr; Connectors &rarr; Add Custom Connector &rarr; paste URL
        </span>
      </div>

      <div class="client-hint">
        <span class="client-name">ChatGPT</span>
        <span class="client-steps">
          Settings &rarr; Connections &rarr; Add remote server &rarr; paste URL
        </span>
      </div>

      <p class="docs-link">
        Need step-by-step instructions?
        <a href="https://savecraft.gg/docs" class="text-link">See the full setup guide &rarr;</a>
      </p>
    </div>

    <!-- What is Savecraft? -->
    <div class="about">
      <h2 class="section-label">WHAT IS SAVECRAFT?</h2>
      <p class="about-text">
        Savecraft connects your video game save files to AI assistants like Claude and ChatGPT. It
        watches your saves, parses them, and makes the data available to your AI so you can ask
        questions about your characters, builds, and progress.
      </p>
      <p class="about-text">
        Savecraft is a connector, not a chatbot. You chat with your AI assistant as usual &mdash;
        Savecraft gives it access to your game data behind the scenes.
      </p>
      <div class="flow-diagram">
        <span class="flow-step">&#x1F3AE; You play</span>
        <span class="flow-arrow">&rarr;</span>
        <span class="flow-step">&#x26A1; Savecraft syncs</span>
        <span class="flow-arrow">&rarr;</span>
        <span class="flow-step">&#x1F916; AI reads</span>
      </div>
    </div>
  </div>
</div>

<style>
  .connect-page {
    display: flex;
    justify-content: center;
    min-height: 100vh;
    padding: 60px 20px;
  }

  .content {
    max-width: 600px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 36px;
    animation: fade-slide-in 0.6s ease-out;
  }

  /* -- Hero ------------------------------------------------- */

  .hero {
    text-align: center;
  }

  .logo {
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-gold);
    letter-spacing: 6px;
    margin-bottom: 20px;
  }

  .title {
    font-family: var(--font-heading);
    font-size: 28px;
    color: var(--color-text);
    font-weight: 600;
    margin-bottom: 10px;
  }

  .subtitle {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-dim);
    line-height: 1.5;
  }

  .subtitle strong {
    color: var(--color-gold);
  }

  /* -- URL section ------------------------------------------ */

  .url-section {
    padding: 20px;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 6px;
  }

  .url-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .url-text {
    flex: 1;
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-green);
    user-select: all;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    flex-shrink: 0;
    font-family: var(--font-pixel);
    font-size: 12px;
    letter-spacing: 2px;
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 4px;
    padding: 10px 20px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-btn:hover {
    background: rgba(200, 168, 78, 0.2);
    border-color: var(--color-gold);
  }

  .copy-btn.copied {
    color: var(--color-green);
    border-color: rgba(90, 190, 138, 0.3);
  }

  /* -- Instructions ----------------------------------------- */

  .instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .client-hint {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(10, 14, 46, 0.6);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .client-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    letter-spacing: 1px;
    color: var(--color-text);
    flex-shrink: 0;
    min-width: 90px;
  }

  .client-steps {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.4;
  }

  .docs-link {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-muted);
    margin-top: 8px;
  }

  .text-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .text-link:hover {
    border-color: var(--color-gold);
  }

  /* -- About ------------------------------------------------ */

  .about {
    padding-top: 12px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
  }

  .about-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin-bottom: 12px;
  }

  .flow-diagram {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: rgba(5, 7, 26, 0.4);
    border-radius: 4px;
    border: 1px solid rgba(200, 168, 78, 0.12);
    margin-top: 4px;
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
</style>
