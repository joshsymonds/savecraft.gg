<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProductionChain from "./ProductionChain.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../views/src/components/layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Components/ProductionChain",
    tags: ["autodocs"],
  });

  const electronicCircuitTree = {
    item: "electronic-circuit",
    recipe: "electronic-circuit",
    machines: 1,
    machine_type: "assembling-machine-2",
    rate_per_min: 90,
    power_kw: 150,
    children: [
      {
        item: "iron-plate",
        recipe: "iron-plate",
        machines: 5,
        machine_type: "stone-furnace",
        rate_per_min: 93.8,
        power_kw: 450,
        children: [
          {
            item: "iron-ore",
            recipe: "(raw)",
            rate_per_min: 93.8,
          },
        ],
      },
      {
        item: "copper-cable",
        recipe: "copper-cable",
        machines: 2,
        machine_type: "assembling-machine-2",
        rate_per_min: 270,
        power_kw: 300,
        children: [
          {
            item: "copper-plate",
            recipe: "copper-plate",
            machines: 10,
            machine_type: "stone-furnace",
            rate_per_min: 187.5,
            power_kw: 900,
            children: [
              {
                item: "copper-ore",
                recipe: "(raw)",
                rate_per_min: 187.5,
              },
            ],
          },
        ],
      },
    ],
  };

  const speedModulesTree = {
    item: "iron-gear-wheel",
    recipe: "iron-gear-wheel",
    machines: 1,
    machine_type: "assembling-machine-3",
    modules: ["speed-module-3", "speed-module-3", "speed-module-3", "speed-module-3"],
    rate_per_min: 450,
    power_kw: 1312.5,
    children: [
      {
        item: "iron-plate",
        recipe: "iron-plate",
        machines: 48,
        machine_type: "stone-furnace",
        rate_per_min: 900,
        power_kw: 4320,
        children: [
          {
            item: "iron-ore",
            recipe: "(raw)",
            rate_per_min: 900,
          },
        ],
      },
    ],
  };
</script>

<Story name="ElectronicCircuit">
  <Panel>
    <Section title="Electronic Circuit Production">
      <ProductionChain tree={electronicCircuitTree} />
    </Section>
  </Panel>
</Story>

<Story name="WithSpeedModules">
  <Panel>
    <Section title="Iron Gear Wheel (Speed Modules)">
      <ProductionChain tree={speedModulesTree} />
    </Section>
  </Panel>
</Story>
