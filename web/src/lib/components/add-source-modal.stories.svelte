<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import AddSourceModal from "./AddSourceModal.svelte";

  const { Story } = defineMeta({
    title: "Components/AddSourceModal",
    tags: ["autodocs"],
  });
</script>

<!-- Modal with install instructions and pairing code input -->
<Story name="Default">
  <AddSourceModal
    onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)}
    onclose={() => alert("Modal closed")}
  />
</Story>
