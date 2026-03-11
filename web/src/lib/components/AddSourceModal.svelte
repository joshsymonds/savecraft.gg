<!--
  @component
  Modal for adding a new source: install instructions + pairing code input.
  Opened by clicking the AddSourceCard in the SourceCardGrid.
-->
<script lang="ts">
  import AddSourceContent from "./AddSourceContent.svelte";
  import Modal from "./Modal.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    onsubmit,
    onapiskip,
    onclose,
  }: {
    onsubmit?: (code: string) => void;
    onapiskip?: () => void;
    onclose: () => void;
  } = $props();
</script>

<Modal id="add-source" {onclose} width="480px" ariaLabel="Add source">
  <WindowTitleBar activeIcon="+" activeLabel="ADD SOURCE">
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>
  <AddSourceContent {onsubmit} {onapiskip} />
</Modal>
