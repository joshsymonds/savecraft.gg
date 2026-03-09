<!--
  @component
  Public help page for users who pasted their connector URL into a browser.
  Explains what Savecraft is and how to set up each AI client. No auth required.
  Also serves as an LLM-readable reference: detailed enough that an AI reading
  the page source can guide a user through full setup.
-->
<script lang="ts">
  import { resolve } from "$app/paths";

  let expandedClient: string | null = $state(null);

  function toggle(client: string): void {
    expandedClient = expandedClient === client ? null : client;
  }
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
      <h1 class="title">You found your connector URL!</h1>
      <p class="subtitle">
        This URL goes in your AI app's <strong>settings</strong>, not in the chat or browser.
      </p>
    </div>

    <!-- Dashboard link -->
    <div class="dashboard-link">
      <p class="dashboard-text">Your connector URL is on your Savecraft dashboard.</p>
      <a href={resolve("/")} class="dashboard-btn">GO TO DASHBOARD</a>
    </div>

    <!-- Client instructions -->
    <div class="instructions">
      <h2 class="section-label">PICK YOUR AI APP</h2>

      <!-- Claude.ai -->
      <button
        class="client-header"
        class:active={expandedClient === "claude"}
        onclick={() => toggle("claude")}
      >
        <span class="client-name">Claude.ai</span>
        <span class="expand-icon">{expandedClient === "claude" ? "−" : "+"}</span>
      </button>
      {#if expandedClient === "claude"}
        <div class="client-detail">
          <ol>
            <li>Open <strong>Claude.ai</strong> in your browser and sign in.</li>
            <li>
              Click your profile icon in the bottom-left corner, then click <strong>Settings</strong
              >.
            </li>
            <li>In the left sidebar, click <strong>Integrations</strong>.</li>
            <li>
              Click <strong>Add more integrations</strong>, then choose
              <strong>Add custom connector</strong>.
            </li>
            <li>
              Paste your connector URL from the Savecraft dashboard into the URL field and click <strong
                >Save</strong
              >.
            </li>
            <li>
              Claude will ask you to <strong>authorize Savecraft</strong>. Click Allow. You'll sign
              in to Savecraft if you aren't already.
            </li>
            <li>
              Once connected, go back to a Claude chat and ask something like: <em
                >"What characters do I have in Savecraft?"</em
              >
            </li>
            <li>
              <strong>Success looks like:</strong> Claude responds with details about your game saves
              — character names, levels, builds, and stats.
            </li>
          </ol>
        </div>
      {/if}

      <!-- ChatGPT -->
      <button
        class="client-header"
        class:active={expandedClient === "chatgpt"}
        onclick={() => toggle("chatgpt")}
      >
        <span class="client-name">ChatGPT</span>
        <span class="expand-icon">{expandedClient === "chatgpt" ? "−" : "+"}</span>
      </button>
      {#if expandedClient === "chatgpt"}
        <div class="client-detail">
          <ol>
            <li>Open <strong>ChatGPT</strong> in your browser and sign in.</li>
            <li>
              Click your profile icon in the top-right corner, then click <strong>Settings</strong>.
            </li>
            <li>In the left sidebar, click <strong>Connections</strong>.</li>
            <li>Click <strong>Add remote server</strong>.</li>
            <li>
              Paste your connector URL from the Savecraft dashboard into the URL field and click <strong
                >Save</strong
              >.
            </li>
            <li>
              ChatGPT will ask you to <strong>authorize Savecraft</strong>. Click Allow. You'll sign
              in to Savecraft if you aren't already.
            </li>
            <li>
              Once connected, start a new chat and ask something like: <em
                >"What characters do I have in Savecraft?"</em
              >
            </li>
            <li>
              <strong>Success looks like:</strong> ChatGPT responds with details about your game saves
              — character names, levels, builds, and stats.
            </li>
          </ol>
        </div>
      {/if}

      <!-- Claude Code -->
      <button
        class="client-header"
        class:active={expandedClient === "claude-code"}
        onclick={() => toggle("claude-code")}
      >
        <span class="client-name">Claude Code (terminal)</span>
        <span class="expand-icon">{expandedClient === "claude-code" ? "−" : "+"}</span>
      </button>
      {#if expandedClient === "claude-code"}
        <div class="client-detail">
          <ol>
            <li>Open your terminal.</li>
            <li>
              Run this command, replacing the URL with your connector URL from the Savecraft
              dashboard:
              <code class="code-block">claude mcp add-remote savecraft https://your-url-here</code>
            </li>
            <li>
              Your browser will open to <strong>authorize Savecraft</strong>. Click Allow. You'll
              sign in to Savecraft if you aren't already.
            </li>
            <li>
              Once connected, start a Claude Code session and ask something like: <em
                >"What characters do I have in Savecraft?"</em
              >
            </li>
            <li>
              <strong>Success looks like:</strong> Claude responds with details about your game saves
              — character names, levels, builds, and stats.
            </li>
          </ol>
        </div>
      {/if}
    </div>

    <!-- What is Savecraft? -->
    <div class="about">
      <h2 class="section-label">WHAT IS SAVECRAFT?</h2>
      <p class="about-text">
        Savecraft connects your video game save files to AI assistants like Claude, ChatGPT, and
        Gemini. It watches your saves, parses them, and makes the data available to your AI so you
        can ask questions about your characters, builds, and progress.
      </p>
      <p class="about-text">
        Savecraft is a connector, not a chatbot. You chat with your AI assistant as usual —
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

  /* -- Dashboard link --------------------------------------- */

  .dashboard-link {
    text-align: center;
    padding: 20px;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(200, 168, 78, 0.2);
    border-radius: 6px;
  }

  .dashboard-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    margin-bottom: 12px;
  }

  .dashboard-btn {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 4px;
    padding: 10px 24px;
    text-decoration: none;
    transition: all 0.15s;
  }

  .dashboard-btn:hover {
    background: rgba(200, 168, 78, 0.2);
    border-color: var(--color-gold);
  }

  /* -- Instructions ----------------------------------------- */

  .instructions {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--color-text-muted);
    margin-bottom: 10px;
  }

  .client-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 14px 18px;
    background: rgba(10, 14, 46, 0.6);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    margin-bottom: 2px;
  }

  .client-header:hover {
    border-color: var(--color-border-light);
    background: rgba(10, 14, 46, 0.8);
  }

  .client-header.active {
    border-color: var(--color-gold);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    margin-bottom: 0;
  }

  .client-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    letter-spacing: 1px;
    color: var(--color-text);
  }

  .expand-icon {
    font-family: var(--font-body);
    font-size: 20px;
    color: var(--color-text-muted);
    line-height: 1;
  }

  .client-detail {
    padding: 18px 20px;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid var(--color-gold);
    border-top: none;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    margin-bottom: 2px;
    animation: fade-in 0.15s ease-out;
  }

  .client-detail ol {
    list-style: decimal;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .client-detail li {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    line-height: 1.5;
  }

  .client-detail li strong {
    color: var(--color-text);
  }

  .client-detail li em {
    color: var(--color-gold-light);
    font-style: italic;
  }

  .code-block {
    display: block;
    margin-top: 8px;
    padding: 10px 14px;
    background: rgba(5, 7, 26, 0.8);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 4px;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-green);
    word-break: break-all;
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
