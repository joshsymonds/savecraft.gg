<!--
  @component
  Modal for adding a new source: install instructions + pairing code input.
  Opened by clicking "Add Source..." in the SourceStrip.
-->
<script lang="ts">
  import AddSourceContent from "./AddSourceContent.svelte";
  import Modal from "./Modal.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    onsubmit,
    onclose,
  }: {
    onsubmit?: (code: string) => void;
    onclose: () => void;
  } = $props();
</script>

<Modal id="add-source" {onclose} width="480px" ariaLabel="Add source">
  <WindowTitleBar activeIcon="+" activeLabel="ADD SOURCE">
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>
  <AddSourceContent {onsubmit} />
</Modal>
