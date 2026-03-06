<!--
  @component
  Modal for adding a new source: install instructions + pairing code input.
  Opened by clicking "Add Source..." in the SourceStrip.
-->
<script lang="ts">
  import AddSourceContent from "./AddSourceContent.svelte";
  import Panel from "./Panel.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    onsubmit,
    onclose,
  }: {
    onsubmit?: (code: string) => void;
    onclose: () => void;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onclose();
  }
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-label="Add source"
  tabindex="-1"
  onkeydown={handleKeydown}
  onclick={handleBackdropClick}
>
  <div class="modal-content">
    <Panel>
      <WindowTitleBar activeIcon="+" activeLabel="ADD SOURCE">
        {#snippet right()}
          <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
        {/snippet}
      </WindowTitleBar>
      <AddSourceContent {onsubmit} />
    </Panel>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 26, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.15s ease-out;
  }

  .modal-content {
    width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    animation: fade-slide-in 0.2s ease-out;
  }

  .modal-close {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 2px;
  }

  .modal-close:hover {
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
  }
</style>
