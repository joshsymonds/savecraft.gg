<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Raids from "./raids.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";
  const { Story } = defineMeta({
    title: "RimWorld/Raids",
    tags: ["autodocs"],
  });
</script>

<Story name="SmallColony">
  <Raids data={{
    total_wealth: 33240,
    wealth_points: 180,
    pawn_points: 120,
    total_points: 300,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="MidGame">
  <Raids data={{
    total_wealth: 150000,
    wealth_points: 1200,
    pawn_points: 560,
    total_points: 1760,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="LateGame">
  <Raids data={{
    total_wealth: 800000,
    wealth_points: 3800,
    pawn_points: 2400,
    total_points: 6200,
    icon_url: iconUrl,
  }} />
</Story>
