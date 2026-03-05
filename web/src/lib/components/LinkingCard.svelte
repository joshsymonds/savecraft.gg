<!--
  @component
  Phantom entry shown during the pairing flow.
  Shows a Panel with input/linking/error states during daemon pairing.

  - input: pairing code entry field
  - linking: spinner + "Connecting..."
  - error: error message + dismiss button
-->
<script lang="ts">
  import Panel from "./Panel.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  type CardState = "input" | "linking" | "error";

  let {
    cardState = "input" as CardState,
    code = "",
    errorMessage = "",
    ondismiss,
    onsubmit,
  }: {
    cardState?: CardState;
    code?: string;
    errorMessage?: string;
    ondismiss?: () => void;
    onsubmit?: (code: string) => void;
  } = $props();

  let codeValue = $state("");

  const ACCENT: Record<CardState, string> = {
    input: "#e8c44e40",
    linking: "#e8c44e40",
    error: "#e85a5a40",
  };

  function handleSubmit(): void {
    const trimmed = codeValue.trim();
    if (trimmed.length >= 6) {
      onsubmit?.(trimmed);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      handleSubmit();
    }
  }
</script>

<div class="linking-card">
  <Panel accent={ACCENT[cardState]}>
    {#if cardState === "input"}
      <WindowTitleBar activeIcon="🔗" activeLabel="ENTER PAIRING CODE">
        {#snippet right()}
          <button class="dismiss-btn" onclick={ondismiss}>CANCEL</button>
        {/snippet}
      </WindowTitleBar>
      <div class="input-content">
        <span class="input-label">Enter the 6-digit pairing code</span>
        <div class="input-row">
          <input
            type="text"
            class="code-input"
            placeholder="000000"
            maxlength={6}
            bind:value={codeValue}
            onkeydown={handleKeydown}
          />
          <button class="link-btn" onclick={handleSubmit} disabled={codeValue.trim().length < 6}>
            LINK
          </button>
        </div>
      </div>
    {:else if cardState === "linking"}
      <WindowTitleBar activeIcon="🔗" activeLabel="PAIRING" activeSublabel="Code {code}">
        {#snippet right()}
          <div class="linking-actions">
            <div class="spinner-badge">
              <span class="spinner-dot"></span>
              <span class="spinner-dot"></span>
              <span class="spinner-dot"></span>
            </div>
            <button class="dismiss-btn" onclick={ondismiss}>CANCEL</button>
          </div>
        {/snippet}
      </WindowTitleBar>
      <div class="linking-content">
        <span class="linking-message">Connecting...</span>
      </div>
    {:else}
      <WindowTitleBar activeIcon="🔗" activeLabel="PAIRING FAILED">
        {#snippet right()}
          <button class="dismiss-btn" onclick={ondismiss}>DISMISS</button>
        {/snippet}
      </WindowTitleBar>
      <div class="error-content">
        <span class="error-message">{errorMessage}</span>
      </div>
    {/if}
  </Panel>
</div>

<style>
  .linking-card {
    animation: fade-slide-in 0.3s ease-out;
  }

  /* -- Input content ----------------------------------------- */

  .input-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input-label {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-muted);
  }

  .input-row {
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
    padding: 8px 14px;
    width: 140px;
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

  .link-btn {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1px;
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 3px;
    padding: 8px 18px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .link-btn:hover:not(:disabled) {
    background: rgba(200, 168, 78, 0.2);
    border-color: var(--color-gold);
  }

  .link-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* -- Linking content ---------------------------------------- */

  .linking-content {
    padding: 20px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .linking-message {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-muted);
    animation: pulse-text 2s ease-in-out infinite;
  }

  @keyframes pulse-text {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .linking-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* -- Spinner badge (title bar right slot) ------------------- */

  .spinner-badge {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 4px 10px;
    background: rgba(200, 168, 78, 0.07);
    border: 1px solid rgba(200, 168, 78, 0.19);
    border-radius: 3px;
  }

  .spinner-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-gold);
    opacity: 0.4;
    animation: dot-pulse 1.2s ease-in-out infinite;
  }

  .spinner-dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .spinner-dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot-pulse {
    0%,
    80%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    40% {
      opacity: 1;
      transform: scale(1.3);
    }
  }

  /* -- Error content ------------------------------------------ */

  .error-content {
    padding: 16px;
  }

  .error-message {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
  }

  /* -- Shared buttons ----------------------------------------- */

  .dismiss-btn {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    background: rgba(74, 90, 173, 0.12);
    border: 1px solid rgba(74, 90, 173, 0.25);
    border-radius: 3px;
    padding: 6px 14px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .dismiss-btn:hover {
    border-color: var(--color-border-light);
    color: var(--color-text-dim);
    background: rgba(74, 90, 173, 0.2);
  }
</style>
