<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Research from "./research.svelte";

  const iconUrl = "/plugins/rimworld/icon.png";

  const { Story } = defineMeta({
    title: "RimWorld/Research",
    tags: ["autodocs"],
  });
</script>

<Story name="ProjectList">
  <Research data={{
    projects: [
      { name: "Smithing", def_name: "Smithing", cost: 500, tech_level: "Neolithic", prerequisites: [] },
      { name: "Machining", def_name: "Machining", cost: 1000, tech_level: "Industrial", prerequisites: ["Smithing"] },
      { name: "Microelectronics", def_name: "Microelectronics", cost: 3000, tech_level: "Industrial", prerequisites: ["Machining"] },
      { name: "Fabrication", def_name: "Fabrication", cost: 4000, tech_level: "Spacer", prerequisites: ["Microelectronics"] },
      { name: "Advanced Fabrication", def_name: "AdvancedFabrication", cost: 4000, tech_level: "Spacer", prerequisites: ["Fabrication"] },
      { name: "Ship Basics", def_name: "ShipBasics", cost: 4000, tech_level: "Ultra", prerequisites: ["AdvancedFabrication"] },
    ],
    count: 6,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ShortChain">
  <Research data={{
    chain: ["Smithing", "Machining"],
    total_cost: 1500,
    colony_tech: "Industrial",
    icon_url: iconUrl,
  }} />
</Story>

<Story name="LongChain">
  <Research data={{
    chain: ["Smithing", "Machining", "Microelectronics", "Fabrication", "Advanced Fabrication"],
    total_cost: 12500,
    colony_tech: "Neolithic",
    icon_url: iconUrl,
  }} />
</Story>
