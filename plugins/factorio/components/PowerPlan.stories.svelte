<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import PowerPlan from "./PowerPlan.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Components/PowerPlan",
    tags: ["autodocs"],
  });

  const icon_url = "/plugins/factorio/icon.png";

  // 36 MW steam with coal: 1 pump, 20 boilers, 40 engines
  const steamCoalData = {
    icon_url,
    target_mw: 36,
    total_generation_mw: 36,
    surplus_mw: 0,
    sources: [
      {
        type: "steam",
        generation_mw: 36,
        entities: {
          "offshore-pump": 1,
          "boiler": 20,
          "steam-engine": 40,
        },
        fuel: {
          type: "coal",
          fuel_per_min: 540,
        },
      },
    ],
  };

  // 10 MW solar: 239 panels, 201 accumulators
  const solar10Data = {
    icon_url,
    target_mw: 10,
    total_generation_mw: 10.04,
    surplus_mw: 0.04,
    sources: [
      {
        type: "solar",
        generation_mw: 10.038,
        entities: {
          "solar-panel": 239,
          "accumulator": 201,
        },
      },
    ],
  };

  // 480 MW nuclear 2x2: 4 reactors, 48 heat exchangers, 83 turbines
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

  // 1120 MW nuclear 2x4: 8 reactors
  const nuclear2x4Data = {
    icon_url,
    target_mw: 1120,
    total_generation_mw: 1122.06,
    surplus_mw: 2.06,
    sources: [
      {
        type: "nuclear",
        generation_mw: 1122.06,
        layout: "2x4",
        entities: {
          "nuclear-reactor": 8,
          "heat-exchanger": 112,
          "steam-turbine": 193,
          "offshore-pump": 10,
        },
        fuel: {
          fuel_cells_per_min: 2.4,
        },
      },
    ],
  };

  // 500 MW mixed: nuclear 2x2 (~483 MW) + solar fills remainder (~17 MW)
  const mixedNuclearSolarData = {
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

  // 100 MW target with 60 MW existing infrastructure
  const existingDeficitData = {
    icon_url,
    target_mw: 100,
    total_generation_mw: 100.38,
    surplus_mw: 0.38,
    existing_mw: 60,
    deficit_mw: 40,
    sources: [
      {
        type: "solar",
        generation_mw: 100.38,
        entities: {
          "solar-panel": 2390,
          "accumulator": 2009,
        },
      },
    ],
  };
</script>

<Story name="SteamCoal">
  <PowerPlan data={steamCoalData} />
</Story>

<Story name="Solar10MW">
  <PowerPlan data={solar10Data} />
</Story>

<Story name="Nuclear2x2">
  <PowerPlan data={nuclear2x2Data} />
</Story>

<Story name="Nuclear2x4">
  <PowerPlan data={nuclear2x4Data} />
</Story>

<Story name="MixedNuclearSolar">
  <PowerPlan data={mixedNuclearSolarData} />
</Story>

<Story name="WithExistingDeficit">
  <PowerPlan data={existingDeficitData} />
</Story>
