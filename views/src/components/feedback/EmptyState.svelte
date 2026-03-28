<!--
  @component
  Displayed when a query returns no results.
  Centered layout with muted icon and optional guidance text.
-->
<script lang="ts">
  interface Props {
    /** Main message (default: "No results found") */
    message?: string;
    /** Optional secondary text with guidance */
    detail?: string;
  }

  let { message = "No results found", detail }: Props = $props();
</script>

<div class="empty-state">
  <span class="icon">&#x2205;</span>
  <p class="message">{message}</p>
  {#if detail}
    <p class="detail">{detail}</p>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xl) var(--space-lg);
    animation: fade-in 0.4s ease-out;
  }

  .icon {
    font-size: 28px;
    color: var(--color-text-muted);
    opacity: 0.5;
    line-height: 1;
  }

  .message {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-align: center;
  }

  .detail {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    opacity: 0.7;
    text-align: center;
    max-width: 320px;
  }
</style>
