<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import InstallBlock from "./InstallBlock.svelte";

  const { Story } = defineMeta({
    title: "Components/InstallBlock",
    tags: ["autodocs"],
  });
</script>

<!-- Hero: full "GET STARTED" with install + pairing code (empty state) -->
<Story name="HeroIdle">
  <div style="width: 720px;">
    <InstallBlock
      prominent={true}
      onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)}
    />
  </div>
</Story>

<!-- Compact: collapsed "ADD ANOTHER SOURCE" row (below source list) -->
<Story name="CompactCollapsed">
  <div style="width: 720px;">
    <InstallBlock
      prominent={false}
      onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)}
    />
  </div>
</Story>
