<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Tooltip from "./Tooltip.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/Tooltip",
    tags: ["autodocs"],
  });
</script>

<Story name="Visible">
  <div style="width: 300px; height: 100px; position: relative;">
    <Panel>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Hover target area</p>
    </Panel>
    <Tooltip text="GIH WR: 65.8%" x={150} y={40} visible={true} />
  </div>
</Story>

<Story name="WithLongText">
  <div style="width: 300px; height: 100px; position: relative;">
    <Panel>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Hover target area</p>
    </Panel>
    <Tooltip text="Boros / Foundations of Arcavios: 55.2%" x={150} y={40} visible={true} />
  </div>
</Story>
