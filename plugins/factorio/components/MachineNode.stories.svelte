<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import MachineNode from "./MachineNode.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Factorio/Components/MachineNode",
    tags: ["autodocs"],
  });
</script>

<Story name="BasicFurnace">
  <Panel>
    <div style="padding: 16px; display: flex; gap: 16px;">
      <div style="width: 260px;">
        <MachineNode
          name="iron-plate"
          machineName="stone-furnace"
          machineCount={5}
          moduleSlots={0}
          modules={[]}
          ratePerMin={187.5}
          beltTier="yellow"
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="WithSpeedModules">
  <Panel>
    <div style="padding: 16px; display: flex; gap: 16px;">
      <div style="width: 260px;">
        <MachineNode
          name="iron-gear-wheel"
          machineName="assembling-machine-3"
          machineCount={1}
          moduleSlots={4}
          modules={["speed-module-3", "speed-module-3", "speed-module-3", "speed-module-3"]}
          ratePerMin={450}
          beltTier="blue"
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="MixedModules">
  <Panel>
    <div style="padding: 16px; display: flex; gap: 16px;">
      <div style="width: 260px;">
        <MachineNode
          name="electronic-circuit"
          machineName="assembling-machine-2"
          machineCount={20}
          moduleSlots={2}
          modules={["productivity-module-2", "speed-module"]}
          ratePerMin={200}
          beltTier="red"
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="RawResource">
  <Panel>
    <div style="padding: 16px; display: flex; gap: 16px;">
      <div style="width: 260px;">
        <MachineNode
          name="iron-ore"
          ratePerMin={93.8}
          beltTier="yellow"
          variant="raw"
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="Bottleneck">
  <Panel>
    <div style="padding: 16px; display: flex; gap: 16px;">
      <div style="width: 260px;">
        <MachineNode
          name="copper-plate"
          machineName="electric-furnace"
          machineCount={12}
          moduleSlots={2}
          modules={["productivity-module-3", "productivity-module-3"]}
          ratePerMin={540}
          beltTier="blue"
          variant="bottleneck"
        />
      </div>
    </div>
  </Panel>
</Story>

<Story name="AllVariants">
  <Panel>
    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="width: 280px;">
        <MachineNode
          name="steel-plate"
          machineName="electric-furnace"
          machineCount={8}
          moduleSlots={2}
          modules={["speed-module-2", "speed-module-2"]}
          ratePerMin={320}
          beltTier="red"
        />
      </div>
      <div style="width: 280px;">
        <MachineNode
          name="advanced-circuit"
          machineName="assembling-machine-3"
          machineCount={4}
          moduleSlots={4}
          modules={["productivity-module-3", "productivity-module-3", "speed-module-3", "speed-module-3"]}
          ratePerMin={120}
          beltTier="yellow"
          variant="surplus"
        />
      </div>
      <div style="width: 280px;">
        <MachineNode
          name="coal"
          ratePerMin={45}
          beltTier="yellow"
          variant="raw"
        />
      </div>
    </div>
  </Panel>
</Story>
