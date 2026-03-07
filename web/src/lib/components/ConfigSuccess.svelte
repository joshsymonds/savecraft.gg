<!--
  @component
  Animated success message shown after a config operation completes.
  Used by SourceEditModal and GamePickerModal.
-->
<script lang="ts">
  let {
    message = "Connected",
  }: {
    message?: string;
  } = $props();
</script>

<div class="config-success">
  <span class="success-icon">&#x2713;</span>
  <span class="success-text">{message}</span>
</div>

<style>
  .config-success {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 0;
    animation: fade-in 0.2s ease-out;
  }

  .success-icon {
    font-size: 24px;
    color: var(--color-green, #5abe8a);
  }

  .success-text {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-green, #5abe8a);
    letter-spacing: 2px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
