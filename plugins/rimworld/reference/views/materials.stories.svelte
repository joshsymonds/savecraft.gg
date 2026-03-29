<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Materials from "./materials.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Materials",
    tags: ["autodocs"],
  });
</script>

<Story name="MaterialList">
  <Materials data={{
    materials: [
      { name: "steel", sharp_armor: 0.50, blunt_armor: 0.25, sharp_damage: 1.00, blunt_damage: 1.00, market_value: 1.9, max_hp_factor: 1.00, categories: ["Metallic"] },
      { name: "plasteel", sharp_armor: 1.20, blunt_armor: 0.60, sharp_damage: 1.00, blunt_damage: 1.00, market_value: 9.0, max_hp_factor: 1.30, categories: ["Metallic"] },
      { name: "uranium", sharp_armor: 0.67, blunt_armor: 0.67, sharp_damage: 2.00, blunt_damage: 2.00, market_value: 6.0, max_hp_factor: 2.50, categories: ["Metallic"] },
      { name: "jade", sharp_armor: 0.20, blunt_armor: 0.20, sharp_damage: 0.50, blunt_damage: 0.50, market_value: 5.0, max_hp_factor: 0.50, categories: ["Stony"] },
      { name: "wood", sharp_armor: 0.40, blunt_armor: 0.40, sharp_damage: 0.50, blunt_damage: 0.50, market_value: 1.2, max_hp_factor: 0.65, categories: ["Woody"] },
      { name: "gold", sharp_armor: 0.30, blunt_armor: 0.30, sharp_damage: 0.50, blunt_damage: 0.50, market_value: 10.0, max_hp_factor: 0.60, categories: ["Metallic"] },
    ],
    icon_url: iconUrl,
  }} />
</Story>

<Story name="PlasteelMasterwork">
  <Materials data={{
    material: "plasteel",
    quality: "masterwork",
    sharp_armor: 1.50,
    blunt_armor: 0.75,
    heat_armor: 0.30,
    sharp_damage: 1.15,
    blunt_damage: 1.15,
    max_hp: 1.95,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="SteelNormal">
  <Materials data={{
    material: "steel",
    quality: "normal",
    sharp_armor: 0.50,
    blunt_armor: 0.25,
    heat_armor: 0.10,
    sharp_damage: 1.00,
    blunt_damage: 1.00,
    max_hp: 1.00,
    icon_url: iconUrl,
  }} />
</Story>
