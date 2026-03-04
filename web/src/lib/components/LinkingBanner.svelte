<!--
  @component
  Inline device-linking status banner.
  Shows linking progress, success, or error states in the device list area.

  Pass `state`, `code`, `errorMessage`, `deviceName` props to bypass internal logic (for Storybook).
-->
<script lang="ts">
  import Panel from "./Panel.svelte";

  type BannerState = "idle" | "linking" | "success" | "error";

  interface Props {
    /** Visual state override (for Storybook) */
    state?: BannerState;
    /** Link code to display */
    code?: string;
    /** Error message to display */
    errorMessage?: string;
    /** Device name after successful link */
    deviceName?: string;
    /** Dismiss handler */
    ondismiss?: () => void;
  }

  let {
    state = "idle",
    code = "",
    errorMessage = "",
    deviceName = "",
    ondismiss,
  }: Props = $props();

  const ACCENT: Record<BannerState, string | undefined> = {
    idle: undefined,
    linking: "#e8c44e40",
    success: "#5abe8a40",
    error: "#e85a5a40",
  };
</script>

{#if state !== "idle"}
  <div class="linking-banner" class:is-success={state === "success"}>
    <Panel accent={ACCENT[state]}>
      <div class="banner-content">
        {#if state === "linking"}
          <div class="banner-row">
            <div class="banner-left">
              <span class="banner-label linking-label">LINKING DEVICE</span>
              <span class="banner-code">{code}</span>
            </div>
            <div class="spinner">
              <span class="spinner-dot"></span>
              <span class="spinner-dot"></span>
              <span class="spinner-dot"></span>
            </div>
          </div>
        {:else if state === "success"}
          <div class="banner-row">
            <div class="banner-left">
              <span class="banner-label success-label">DEVICE LINKED</span>
              <span class="banner-detail">{deviceName}</span>
            </div>
            <span class="checkmark">&#10003;</span>
          </div>
        {:else if state === "error"}
          <div class="banner-row">
            <div class="banner-left">
              <span class="banner-label error-label">LINKING FAILED</span>
              <span class="banner-detail">{errorMessage}</span>
            </div>
            <button class="dismiss-btn" onclick={ondismiss}>DISMISS</button>
          </div>
        {/if}
      </div>
    </Panel>
  </div>
{/if}

<style>
  .linking-banner {
    animation: fade-slide-in 0.3s ease-out;
  }

  .is-success {
    animation:
      fade-slide-in 0.3s ease-out,
      success-glow 0.6s ease-out;
  }

  @keyframes success-glow {
    0% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.15);
    }
    100% {
      filter: brightness(1);
    }
  }

  .banner-content {
    padding: 16px 20px;
  }

  .banner-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .banner-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .linking-label {
    color: var(--color-gold);
  }

  .success-label {
    color: var(--color-green);
  }

  .error-label {
    color: var(--color-red);
  }

  .banner-code {
    font-family: var(--font-body);
    font-size: 22px;
    color: var(--color-text);
    letter-spacing: 4px;
  }

  .banner-detail {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* -- Spinner (three-dot pulse) ------------------------------ */

  .spinner {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
  }

  .spinner-dot {
    width: 6px;
    height: 6px;
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

  /* -- Success checkmark -------------------------------------- */

  .checkmark {
    font-size: 18px;
    color: var(--color-green);
    flex-shrink: 0;
    filter: drop-shadow(0 0 4px rgba(90, 190, 138, 0.4));
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
    flex-shrink: 0;
  }

  .dismiss-btn:hover {
    border-color: var(--color-border-light);
    color: var(--color-text-dim);
    background: rgba(74, 90, 173, 0.2);
  }
</style>
