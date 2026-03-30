<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import MachineNode from "./MachineNode.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../views/src/components/layout/Section.svelte";
  import itemManifest from "../sprites/items.json";

  const { Story } = defineMeta({
    title: "Factorio/Components/MachineNode",
    tags: ["autodocs"],
  });

  const spriteConfig = {
    url: "/plugins/factorio/sprites/items.png",
    sheetWidth: 2048,
    sheetHeight: 704,
    manifest: itemManifest,
  };
</script>

<Story name="AllVariants">
  <div class="node-gallery">
    <div class="fake-node">
      <MachineNode
        name="iron-plate"
        machineName="stone-furnace"
        machineCount={5}
        ratePerMin={187.5}
        {spriteConfig}
      />
    </div>
    <div class="fake-node">
      <MachineNode
        name="electronic-circuit"
        machineName="assembling-machine-2"
        machineCount={20}
        modules={["productivity-module-2", "speed-module"]}
        ratePerMin={200}
        {spriteConfig}
      />
    </div>
    <div class="fake-node">
      <MachineNode
        name="advanced-circuit"
        machineName="assembling-machine-3"
        machineCount={4}
        modules={["productivity-module-3", "productivity-module-3", "speed-module-3", "speed-module-3"]}
        ratePerMin={120}
        {spriteConfig}
      />
    </div>
    <div class="fake-node node-raw">
      <MachineNode
        name="iron-ore"
        ratePerMin={93.8}
        variant="raw"
        {spriteConfig}
      />
    </div>
  </div>
</Story>

<Story name="LabelFallback">
  <div class="node-gallery">
    <div class="fake-node">
      <MachineNode
        name="electronic-circuit"
        machineName="assembling-machine-2"
        machineCount={20}
        modules={["productivity-module-2", "speed-module"]}
        ratePerMin={200}
      />
    </div>
    <div class="fake-node node-raw">
      <MachineNode
        name="iron-ore"
        ratePerMin={93.8}
        variant="raw"
      />
    </div>
  </div>
</Story>

<style>
  .node-gallery {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    max-width: 360px;
  }

  .fake-node {
    background: var(--color-surface, #0a0e2e);
    border: 1.5px solid #8a6a2a;
    border-radius: 6px;
  }

  .node-raw {
    border-style: dashed;
    border-color: var(--color-text-muted, #a0a8cc);
    opacity: 0.75;
  }
</style>
