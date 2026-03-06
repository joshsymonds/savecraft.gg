<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import AddSourceContent from "./AddSourceContent.svelte";
  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/AddSourceContent",
    tags: ["autodocs"],
  });
</script>

<!-- Default: install + pairing content inside a Panel -->
<Story name="Default">
  <div style="width: 520px;">
    <Panel>
      <AddSourceContent onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)} />
    </Panel>
  </div>
</Story>

<!-- Narrow: how it looks in a tighter container (e.g. empty state card) -->
<Story name="Narrow">
  <div style="width: 400px;">
    <Panel>
      <AddSourceContent onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)} />
    </Panel>
  </div>
</Story>
