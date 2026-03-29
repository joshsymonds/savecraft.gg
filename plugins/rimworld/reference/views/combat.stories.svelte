<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Combat from "./combat.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Combat",
    tags: ["autodocs"],
  });
</script>

<Story name="AssaultRifle">
  <Combat data={{
    weapon: "assault rifle",
    type: "ranged",
    raw_dps: 8.91,
    accuracy: 0.72,
    dps_at_range: 6.42,
    damage_per_shot: 11,
    expected_damage: 11,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="BoltActionVsArmor">
  <Combat data={{
    weapon: "bolt-action rifle",
    type: "ranged",
    raw_dps: 5.5,
    accuracy: 0.85,
    dps_at_range: 4.68,
    damage_per_shot: 18,
    expected_damage: 12.3,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="Longsword">
  <Combat data={{
    weapon: "longsword",
    type: "melee",
    true_dps: 12.5,
    icon_url: iconUrl,
  }} />
</Story>
