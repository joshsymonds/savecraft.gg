<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import InstallBlock from "./InstallBlock.svelte";

  const { Story } = defineMeta({
    title: "Components/InstallBlock",
    tags: ["autodocs"],
  });
</script>

<!-- Hero: idle state — the main "PAIR A DEVICE" CTA -->
<Story name="HeroIdle">
  <div style="width: 720px;">
    <InstallBlock prominent={true} initialState={{ pairingState: "idle" }} />
  </div>
</Story>

<!-- Hero: active pairing code with countdown timer -->
<Story name="HeroWithCode">
  <div style="width: 720px;">
    <InstallBlock
      prominent={true}
      initialState={{ pairingState: "active", pairingCode: "847293", remainingSeconds: 97 }}
    />
  </div>
</Story>

<!-- Hero: expired code -->
<Story name="HeroExpired">
  <div style="width: 720px;">
    <InstallBlock prominent={true} initialState={{ pairingState: "expired" }} />
  </div>
</Story>

<!-- Compact: collapsed "ADD ANOTHER DEVICE" row -->
<Story name="CompactCollapsed">
  <div style="width: 720px;">
    <InstallBlock prominent={false} initialState={{ pairingState: "idle" }} />
  </div>
</Story>

<!-- Compact: expanded with pairing flow visible -->
<Story name="CompactExpanded">
  <div style="width: 720px;">
    <!-- Note: compact mode starts collapsed, user must click to expand.
         Storybook will show the collapsed state; click "ADD ANOTHER DEVICE" to see the flow. -->
    <InstallBlock prominent={false} initialState={{ pairingState: "idle" }} />
  </div>
</Story>
