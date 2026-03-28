<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import LegendBar from "./LegendBar.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/LegendBar",
    tags: ["autodocs"],
  });
</script>

<Story name="Horizontal">
  <Panel>
    <LegendBar items={[
      { label: "Your Pick", color: "var(--color-positive)" },
      { label: "Average", color: "var(--color-info)" },
      { label: "Best Available", color: "var(--color-warning)" },
    ]} />
  </Panel>
</Story>

<Story name="Vertical">
  <Panel>
    <LegendBar
      layout="vertical"
      items={[
        { label: "Mythic", color: "var(--color-rarity-legendary)" },
        { label: "Rare", color: "var(--color-rarity-rare)" },
        { label: "Uncommon", color: "var(--color-rarity-uncommon)" },
        { label: "Common", color: "var(--color-rarity-common)" },
      ]}
    />
  </Panel>
</Story>

<Story name="ChartSeries">
  <Panel>
    <LegendBar items={[
      { label: "Boros Aggro", color: "var(--color-chart-1)" },
      { label: "Dimir Control", color: "var(--color-chart-2)" },
      { label: "Gruul Midrange", color: "var(--color-chart-3)" },
      { label: "Orzhov Tokens", color: "var(--color-chart-4)" },
      { label: "Simic Ramp", color: "var(--color-chart-5)" },
    ]} />
  </Panel>
</Story>
