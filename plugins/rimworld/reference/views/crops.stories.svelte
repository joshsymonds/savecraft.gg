<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Crops from "./crops.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Crops",
    tags: ["autodocs"],
  });
</script>

<Story name="Rice">
  <Crops data={{
    crop: "rice plant",
    growth_rate: 1.0,
    actual_grow_days: 5.14,
    nutrition_per_day: 0.058,
    silver_per_day: 1.284,
    tiles_needed: 12,
    hydroponics: true,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="CornOnRichSoil">
  <Crops data={{
    crop: "corn plant",
    growth_rate: 1.4,
    actual_grow_days: 8.16,
    nutrition_per_day: 0.092,
    silver_per_day: 2.105,
    tiles_needed: 7,
    hydroponics: false,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="DevilstrandOnGravel">
  <Crops data={{
    crop: "devilstrand",
    growth_rate: 0.49,
    actual_grow_days: 46.8,
    nutrition_per_day: 0.0,
    silver_per_day: 0.342,
    tiles_needed: 0,
    hydroponics: false,
    icon_url: iconUrl,
  }} />
</Story>
