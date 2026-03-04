<!--
  @component
  Phantom device entry shown during the device linking flow.
  Mimics DeviceWindow shape (Panel + WindowTitleBar) with linking/error states.

  Pass `state`, `code`, `errorMessage` props directly (for Storybook or homepage use).
-->
<script lang="ts">
  import Panel from "./Panel.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  type CardState = "linking" | "error";

  let {
    state = "linking" as CardState,
    code = "",
    errorMessage = "",
    ondismiss,
  }: {
    state?: CardState;
    code?: string;
    errorMessage?: string;
    ondismiss?: () => void;
  } = $props();

  const ACCENT: Record<CardState, string> = {
    linking: "#e8c44e40",
    error: "#e85a5a40",
  };
</script>

<div class="linking-card">
  <Panel accent={ACCENT[state]}>
    {#if state === "linking"}
      <WindowTitleBar activeIcon="🔗" activeLabel="LINKING DEVICE" activeSublabel="Code {code}">
        {#snippet right()}
          <div class="spinner-badge">
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
          </div>
        {/snippet}
      </WindowTitleBar>
      <div class="linking-content">
        <span class="linking-message">Connecting to device...</span>
      </div>
    {:else}
      <WindowTitleBar activeIcon="🔗" activeLabel="LINKING FAILED">
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

  /* -- Dismiss button ----------------------------------------- */

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
