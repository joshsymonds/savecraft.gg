<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import MachineNode from "./MachineNode.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
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

<Story name="BasicFurnace">
  <Panel>
    <div style="padding: 8px; display: flex; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="iron-plate"
          machineName="stone-furnace"
          machineCount={5}
          ratePerMin={187.5}
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="WithSpeedModules">
  <Panel>
    <div style="padding: 8px; display: flex; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="iron-gear-wheel"
          machineName="assembling-machine-3"
          machineCount={1}
          modules={["speed-module-3", "speed-module-3", "speed-module-3", "speed-module-3"]}
          ratePerMin={450}
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="MixedModules">
  <Panel>
    <div style="padding: 8px; display: flex; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="electronic-circuit"
          machineName="assembling-machine-2"
          machineCount={20}
          modules={["productivity-module-2", "speed-module"]}
          ratePerMin={200}
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="RawResource">
  <Panel>
    <div style="padding: 8px; display: flex; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="iron-ore"
          ratePerMin={93.8}
          variant="raw"
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="Bottleneck">
  <Panel>
    <div style="padding: 8px; display: flex; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="copper-plate"
          machineName="electric-furnace"
          machineCount={12}
          modules={["productivity-module-3", "productivity-module-3"]}
          ratePerMin={540}
          variant="bottleneck"
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="AllVariants">
  <Panel>
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="width: 300px;">
        <MachineNode
          name="steel-plate"
          machineName="electric-furnace"
          machineCount={8}
          modules={["speed-module-2", "speed-module-2"]}
          ratePerMin={320}
          {spriteConfig}
        />
      </div>
      <div style="width: 300px;">
        <MachineNode
          name="advanced-circuit"
          machineName="assembling-machine-3"
          machineCount={4}
          modules={["productivity-module-3", "productivity-module-3", "speed-module-3", "speed-module-3"]}
          ratePerMin={120}
          variant="surplus"
          {spriteConfig}
        />
      </div>
      <div style="width: 300px;">
        <MachineNode
          name="coal"
          ratePerMin={45}
          variant="raw"
          {spriteConfig}
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="LabelFallback">
  <Panel>
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="width: 300px;">
        <MachineNode
          name="electronic-circuit"
          machineName="assembling-machine-2"
          machineCount={20}
          modules={["productivity-module-2", "speed-module"]}
          ratePerMin={200}
        />
      </div>
      <div style="width: 300px;">
        <MachineNode
          name="iron-ore"
          ratePerMin={93.8}
          variant="raw"
        />
      </div>
    </div>
  </Panel>
</Story>
