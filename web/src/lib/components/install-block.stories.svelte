<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import InstallBlock from "./InstallBlock.svelte";

  const { Story } = defineMeta({
    title: "Components/InstallBlock",
    tags: ["autodocs"],
  });
</script>

<!-- Hero: full "GET STARTED" CTA for empty state (no devices yet) -->
<Story name="HeroIdle">
  <div style="width: 720px;">
    <InstallBlock prominent={true} />
  </div>
</Story>

<!-- Compact: collapsed "ADD ANOTHER DEVICE" row (below device list) -->
<Story name="CompactCollapsed">
  <div style="width: 720px;">
    <InstallBlock prominent={false} />
  </div>
</Story>
