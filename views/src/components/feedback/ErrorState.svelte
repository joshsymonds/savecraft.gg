<!--
  @component
  Displayed when a tool or query fails.
  Centered layout with red accent and optional recovery guidance.
-->
<script lang="ts">
  interface Props {
    /** Error message (default: "Something went wrong") */
    message?: string;
    /** Optional technical detail or recovery guidance */
    detail?: string;
  }

  let { message = "Something went wrong", detail }: Props = $props();
</script>

<div class="error-state">
  <span class="icon" style:color="var(--color-negative)">&#x26A0;</span>
  <p class="message">{message}</p>
  {#if detail}
    <p class="detail">{detail}</p>
  {/if}
</div>

<style>
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xl) var(--space-lg);
    animation: fade-in 0.4s ease-out;
  }

  .icon {
    font-size: 28px;
    line-height: 1;
  }

  .message {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-negative);
    text-align: center;
  }

  .detail {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    text-align: center;
    max-width: 320px;
  }
</style>
