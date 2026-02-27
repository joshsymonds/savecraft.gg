<!--
  @component
  Connect page: MCP setup instructions for Claude.ai.
-->
<script lang="ts">
  import { PUBLIC_API_URL } from "$env/static/public";
  import { Panel, TinyButton } from "$lib/components";

  const mcpUrl = `${PUBLIC_API_URL}/mcp`;
  let copied = $state(false);
  let copyError = $state(false);

  async function copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      copied = true;
      copyError = false;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      copyError = true;
      setTimeout(() => { copyError = false; }, 2000);
    }
  }
</script>

<div class="connect-page">
  <div class="page-header">
    <span class="page-label">CONNECT</span>
    <span class="page-subtitle">Connect an AI assistant to your game data</span>
  </div>

  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">1</span>
        <span class="step-title">Open Claude.ai Settings</span>
      </div>
      <p class="step-desc">
        Go to <strong>claude.ai</strong> and open <strong>Settings</strong> from the sidebar menu.
        Navigate to the <strong>Connectors</strong> section.
      </p>
    </div>
  </Panel>

  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">2</span>
        <span class="step-title">Add Custom Connector</span>
      </div>
      <p class="step-desc">Click <strong>"Add custom connector"</strong> and enter this URL:</p>
      <div class="url-block">
        <code class="url-text">{mcpUrl}</code>
        <TinyButton label={copyError ? "FAILED" : copied ? "COPIED" : "COPY"} onclick={copyUrl} />
      </div>
    </div>
  </Panel>

  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">3</span>
        <span class="step-title">Sign In</span>
      </div>
      <p class="step-desc">
        Click <strong>Add</strong>, then sign in with your Savecraft account when prompted.
        Use the same account you signed up with here.
      </p>
    </div>
  </Panel>

  <Panel>
    <div class="section">
      <div class="step-header">
        <span class="step-number">4</span>
        <span class="step-title">Start Chatting</span>
      </div>
      <p class="step-desc">
        Once connected, try asking Claude about your game data:
      </p>
      <div class="examples">
        <div class="example">"What games do I have?"</div>
        <div class="example">"Tell me about my Warlock"</div>
        <div class="example">"What gear is my character wearing?"</div>
        <div class="example">"How should I respec my skill points?"</div>
      </div>
    </div>
  </Panel>
</div>

<style>
  .connect-page {
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

  .step-desc :global(strong) {
    color: var(--color-text);
  }

  .url-block {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(5, 7, 26, 0.5);
    padding: 10px 12px;
    border-radius: 3px;
    border: 1px solid rgba(74, 90, 173, 0.15);
  }

  .url-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-green);
    flex: 1;
  }

  .examples {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .example {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
    padding: 6px 12px;
    background: rgba(74, 90, 173, 0.06);
    border-left: 2px solid var(--color-gold);
    border-radius: 0 3px 3px 0;
  }
</style>
