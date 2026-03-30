<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import PowerCalculator from "./power-calculator.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Views/PowerCalculator",
    tags: ["autodocs"],
  });

  const icon_url = "/plugins/factorio/icon.png";

  const nuclear2x2Data = {
    icon_url,
    target_mw: 480,
    total_generation_mw: 483.06,
    surplus_mw: 3.06,
    sources: [
      {
        type: "nuclear",
        generation_mw: 483.06,
        layout: "2x2",
        entities: {
          "nuclear-reactor": 4,
          "heat-exchanger": 48,
          "steam-turbine": 83,
          "offshore-pump": 5,
        },
        fuel: {
          fuel_cells_per_min: 1.2,
        },
      },
    ],
  };

  const mixedData = {
    icon_url,
    target_mw: 500,
    total_generation_mw: 500.03,
    surplus_mw: 0.03,
    sources: [
      {
        type: "nuclear",
        generation_mw: 483.06,
        layout: "2x2",
        entities: {
          "nuclear-reactor": 4,
          "heat-exchanger": 48,
          "steam-turbine": 83,
          "offshore-pump": 5,
        },
        fuel: {
          fuel_cells_per_min: 1.2,
        },
      },
      {
        type: "solar",
        generation_mw: 16.968,
        entities: {
          "solar-panel": 404,
          "accumulator": 340,
        },
      },
    ],
  };
</script>

<Story name="Nuclear2x2">
  <PowerCalculator data={nuclear2x2Data} />
</Story>

<Story name="MixedNuclearSolar">
  <PowerCalculator data={mixedData} />
</Story>
