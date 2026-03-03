<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ParentChip from "./ParentChip.svelte";

  const { Story } = defineMeta({
    title: "Components/ParentChip",
    tags: ["autodocs"],
  });
</script>

<Story name="WithIcon">
  <ParentChip icon="🖥" label="DESKTOP-PC" onclick={() => alert("clicked")} />
</Story>

<Story name="WithoutIcon">
  <ParentChip label="D2R" onclick={() => alert("clicked")} />
</Story>

<Story name="Breadcrumb">
  <div style="display: flex; align-items: center; gap: 6px;">
    <ParentChip icon="🖥" label="DESKTOP-PC" onclick={() => alert("device")} />
    <span style="font-family: var(--font-pixel); font-size: 10px; color: var(--color-text-muted);"
      >▸</span
    >
    <ParentChip icon="⚔" label="D2R" onclick={() => alert("game")} />
  </div>
</Story>
