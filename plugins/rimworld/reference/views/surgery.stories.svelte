<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Surgery from "./surgery.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Surgery",
    tags: ["autodocs"],
  });
</script>

<Story name="HighSuccess">
  <Surgery data={{
    success_chance: 0.98,
    surgeon_factor: 1.15,
    bed_factor: 1.10,
    medicine_factor: 1.60,
    difficulty: 1.0,
    inspired: false,
    capped: true,
    uncapped: 1.05,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ModerateSuccess">
  <Surgery data={{
    success_chance: 0.653,
    surgeon_factor: 0.75,
    bed_factor: 1.10,
    medicine_factor: 1.00,
    difficulty: 1.0,
    inspired: false,
    capped: false,
    uncapped: 0.653,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="LowSuccess">
  <Surgery data={{
    success_chance: 0.126,
    surgeon_factor: 0.35,
    bed_factor: 0.80,
    medicine_factor: 0.60,
    difficulty: 1.50,
    inspired: false,
    capped: false,
    uncapped: 0.126,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="InspiredSurgery">
  <Surgery data={{
    success_chance: 0.98,
    surgeon_factor: 0.75,
    bed_factor: 1.10,
    medicine_factor: 1.00,
    difficulty: 1.0,
    inspired: true,
    capped: true,
    uncapped: 1.65,
    icon_url: iconUrl,
  }} />
</Story>
