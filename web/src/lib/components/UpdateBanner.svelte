<script lang="ts">
  interface Props {
    onreload?: () => void;
  }

  let { onreload = () => location.reload() }: Props = $props();
</script>

<button class="update-banner" onclick={onreload}> New version available — click to reload </button>

<style>
  .update-banner {
    width: 100%;
    padding: 8px;
    border: none;
    background: var(--color-gold);
    color: var(--color-bg);
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    text-align: center;
    cursor: pointer;
    transition: background 0.2s;
  }

  .update-banner:hover {
    filter: brightness(1.15);
  }
</style>
