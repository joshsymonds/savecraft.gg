<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ComponentSearch from "./component-search.svelte";

  const { Story } = defineMeta({
    title: "Stellaris/ComponentSearch",
    tags: ["autodocs"],
  });
</script>

<Story name="MixedComponents">
  <ComponentSearch data={{
    results: [
      { key: "BATTLESHIP_ZERO_POINT_REACTOR", size: "small", power: 1550, component_set: "power_core", prerequisites: ["tech_zero_point_power"] },
      { key: "BATTLESHIP_DARK_MATTER_REACTOR", size: "small", power: 2000, component_set: "power_core", prerequisites: ["tech_dark_matter_power_core"] },
      { key: "LARGE_LASER_4", size: "large", power: 0, component_set: "LASER_4", prerequisites: ["tech_lasers_4"] },
      { key: "MEDIUM_MASS_DRIVER_3", size: "medium", power: 0, component_set: "MASS_DRIVER_3", prerequisites: ["tech_mass_drivers_3"] },
      { key: "AFTERBURNER_2", size: "aux", power: -20, component_set: "AFTERBURNER_2", prerequisites: ["tech_afterburners_2"] },
      { key: "ARMOR_HARDENER_1", size: "aux", power: -15, component_set: "ARMOR_HARDENER_1", prerequisites: ["tech_armor_hardeners_1"] },
      { key: "AI_STRIKE_CRAFT", size: "LARGE", power: -60, component_set: "AI_STRIKE_CRAFT_1", prerequisites: [] },
      { key: "PERDITION_BEAM", size: "extra_large", power: 0, component_set: "PERDITION_BEAM_1", prerequisites: ["tech_titans"] },
    ],
    count: 8,
  }} />
</Story>

<Story name="ReactorsOnly">
  <ComponentSearch data={{
    results: [
      { key: "BATTLESHIP_FISSION_REACTOR", size: "small", power: 550, component_set: "power_core", prerequisites: ["tech_fission_power"] },
      { key: "BATTLESHIP_FUSION_REACTOR", size: "small", power: 720, component_set: "power_core", prerequisites: ["tech_fusion_power"] },
      { key: "BATTLESHIP_COLD_FUSION_REACTOR", size: "small", power: 950, component_set: "power_core", prerequisites: ["tech_cold_fusion_power"] },
      { key: "BATTLESHIP_ANTIMATTER_REACTOR", size: "small", power: 1250, component_set: "power_core", prerequisites: ["tech_antimatter_power"] },
      { key: "BATTLESHIP_ZERO_POINT_REACTOR", size: "small", power: 1550, component_set: "power_core", prerequisites: ["tech_zero_point_power"] },
      { key: "BATTLESHIP_DARK_MATTER_REACTOR", size: "small", power: 2000, component_set: "power_core", prerequisites: ["tech_dark_matter_power_core"] },
    ],
    count: 6,
  }} />
</Story>

<Story name="EmptyResults">
  <ComponentSearch data={{
    results: [],
    count: 0,
  }} />
</Story>
