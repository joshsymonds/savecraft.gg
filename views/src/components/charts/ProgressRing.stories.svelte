<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProgressRing from "./ProgressRing.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/ProgressRing",
    tags: ["autodocs"],
  });
</script>

<Story name="SurgerySuccess">
  <Panel padding="var(--space-xl)">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <ProgressRing value={85.5} label="85%" variant="positive" size={100} />
      <span style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1.5px;">Surgery Success</span>
    </div>
  </Panel>
</Story>

<Story name="LowValue">
  <Panel padding="var(--space-xl)">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <ProgressRing value={32} label="32%" variant="negative" size={100} />
      <span style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1.5px;">Win Rate</span>
    </div>
  </Panel>
</Story>

<Story name="MultipleRings">
  <Panel padding="var(--space-xl)">
    <div style="display: flex; justify-content: space-around;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 var(--space-lg);">
        <ProgressRing value={92} label="92%" variant="positive" />
        <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Completion</span>
      </div>
      <div style="width: 1px; align-self: stretch; background: color-mix(in srgb, var(--color-border) 30%, transparent);"></div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 var(--space-lg);">
        <ProgressRing value={58} label="58%" variant="highlight" />
        <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Win Rate</span>
      </div>
      <div style="width: 1px; align-self: stretch; background: color-mix(in srgb, var(--color-border) 30%, transparent);"></div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 var(--space-lg);">
        <ProgressRing value={75} label="75%" variant="info" />
        <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Max Res</span>
      </div>
    </div>
  </Panel>
</Story>
