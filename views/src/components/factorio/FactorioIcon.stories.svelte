<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import FactorioIcon from "./FactorioIcon.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  // Import manifests for Storybook (build-time)
  import itemManifest from "../../../../plugins/factorio/sprites/items.json";
  import fluidManifest from "../../../../plugins/factorio/sprites/fluids.json";

  const { Story } = defineMeta({
    title: "Factorio/Components/FactorioIcon",
    tags: ["autodocs"],
  });

  // Sprite configs for Storybook — using local file paths
  // In production, these URLs would point to R2
  const itemConfig = {
    url: "/plugins/factorio/sprites/items.png",
    sheetWidth: 2048,
    sheetHeight: 704,
    manifest: itemManifest,
  };

  const fluidConfig = {
    url: "/plugins/factorio/sprites/fluids.png",
    sheetWidth: 2048,
    sheetHeight: 128,
    manifest: fluidManifest,
  };

  const commonItems = [
    "iron-plate", "copper-plate", "steel-plate", "iron-gear-wheel",
    "copper-cable", "electronic-circuit", "advanced-circuit", "processing-unit",
    "iron-ore", "copper-ore", "coal", "stone",
    "transport-belt", "fast-transport-belt", "express-transport-belt",
    "inserter", "fast-inserter", "bulk-inserter",
    "assembling-machine-1", "assembling-machine-2", "assembling-machine-3",
    "speed-module-3", "productivity-module-3", "efficiency-module-3",
    "automation-science-pack", "logistic-science-pack", "chemical-science-pack",
    "solar-panel", "accumulator", "nuclear-reactor",
  ];

  const commonFluids = [
    "water", "crude-oil", "petroleum-gas", "light-oil",
    "heavy-oil", "lubricant", "sulfuric-acid", "steam",
  ];
</script>

<Story name="ItemIcons">
  <Panel>
    <Section title="Common Items (32px, sprite mode)">
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        {#each commonItems as name}
          <FactorioIcon {name} spriteConfig={itemConfig} />
        {/each}
      </div>
    </Section>
  </Panel>
</Story>

<Story name="FluidIcons">
  <Panel>
    <Section title="Common Fluids (32px, sprite mode)">
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        {#each commonFluids as name}
          <FactorioIcon {name} spriteConfig={fluidConfig} />
        {/each}
      </div>
    </Section>
  </Panel>
</Story>

<Story name="LabelFallback">
  <Panel>
    <Section title="Label Mode (no sprite sheet)">
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        {#each commonItems.slice(0, 12) as name}
          <FactorioIcon {name} />
        {/each}
      </div>
    </Section>
  </Panel>
</Story>

<Story name="Sizes">
  <Panel>
    <Section title="Different Sizes">
      <div style="display: flex; align-items: center; gap: 16px;">
        <FactorioIcon name="electronic-circuit" size={16} spriteConfig={itemConfig} />
        <FactorioIcon name="electronic-circuit" size={24} spriteConfig={itemConfig} />
        <FactorioIcon name="electronic-circuit" size={32} spriteConfig={itemConfig} />
        <FactorioIcon name="electronic-circuit" size={48} spriteConfig={itemConfig} />
        <FactorioIcon name="electronic-circuit" size={64} spriteConfig={itemConfig} />
      </div>
    </Section>
  </Panel>
</Story>
