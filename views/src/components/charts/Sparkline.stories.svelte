<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Sparkline from "./Sparkline.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/Sparkline",
    tags: ["autodocs"],
  });
</script>

<Story name="WinRateTrend">
  <Panel>
    <div style="display: flex; align-items: center; gap: 12px; padding: 4px;">
      <span style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text);">Win Rate</span>
      <Sparkline values={[52, 55, 48, 61, 58, 63, 59, 65, 62, 68]} color="var(--color-positive)" width={120} height={28} />
      <span style="font-family: var(--font-heading); font-size: 16px; font-weight: 700; color: var(--color-positive);">68%</span>
    </div>
  </Panel>
</Story>

<Story name="DeclineTrend">
  <Panel>
    <div style="display: flex; align-items: center; gap: 12px; padding: 4px;">
      <span style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text);">Rating</span>
      <Sparkline values={[1850, 1820, 1790, 1810, 1770, 1740, 1720]} color="var(--color-negative)" width={120} height={28} />
      <span style="font-family: var(--font-heading); font-size: 16px; font-weight: 700; color: var(--color-negative);">1720</span>
    </div>
  </Panel>
</Story>

<Story name="InlineUsage">
  <Panel>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-family: var(--font-body); font-size: 15px; color: var(--color-text);">Premier Draft</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Sparkline values={[52, 55, 58, 61, 59, 63]} color="var(--color-positive)" />
          <span style="font-family: var(--font-heading); font-size: 14px; font-weight: 600; color: var(--color-positive);">63%</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-family: var(--font-body); font-size: 15px; color: var(--color-text);">Quick Draft</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Sparkline values={[48, 51, 49, 47, 50, 48]} color="var(--color-warning)" />
          <span style="font-family: var(--font-heading); font-size: 14px; font-weight: 600; color: var(--color-warning);">48%</span>
        </div>
      </div>
    </div>
  </Panel>
</Story>
