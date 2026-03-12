<!--
  @component
  Add source card: dashed gold border card that matches SourceCard dimensions.
  Used as the last item in SourceCardGrid.
-->
<script lang="ts">
  let {
    onclick,
  }: {
    onclick?: () => void;
  } = $props();
</script>

<button class="add-source-card" {onclick}>
  <span class="add-icon">+</span>
  <span class="add-label">ADD SOURCE</span>
</button>

<style>
  .add-source-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 18px 24px 16px;
    border-radius: 6px;
    background: rgba(200, 168, 78, 0.04);
    border: 1px dashed rgba(200, 168, 78, 0.3);
    cursor: pointer;
    min-width: 150px;
    min-height: 120px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .add-source-card:hover {
    background: rgba(200, 168, 78, 0.1);
    border-color: var(--color-gold);
  }

  .add-source-card:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .add-icon {
    font-family: var(--font-body);
    font-size: 28px;
    color: var(--color-gold);
    line-height: 1;
  }

  .add-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 1.5px;
  }
</style>
