<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SourceChip from "./SourceChip.svelte";

  const { Story } = defineMeta({
    title: "Components/SourceChip",
    tags: ["autodocs"],
  });
</script>

<Story name="Online">
  <SourceChip
    name="STEAM-DECK"
    status="online"
    lastSeen="now"
    onclick={() => alert("Clicked: STEAM-DECK")}
  />
</Story>

<Story name="Offline">
  <SourceChip
    name="DESKTOP-PC"
    status="offline"
    lastSeen="3h ago"
    onclick={() => alert("Clicked: DESKTOP-PC")}
  />
</Story>

<Story name="Error">
  <SourceChip
    name="LAPTOP"
    status="error"
    lastSeen="5m ago"
    onclick={() => alert("Clicked: LAPTOP")}
  />
</Story>
