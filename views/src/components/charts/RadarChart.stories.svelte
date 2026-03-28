<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import RadarChart from "./RadarChart.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";
  import LegendBar from "../data/LegendBar.svelte";
  import Divider from "../layout/Divider.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/RadarChart",
    tags: ["autodocs"],
  });
</script>

<Story name="DraftAdvisor">
  <div style="width: 350px;">
    <Panel>
      <Section title="Pick Analysis" subtitle="Lightning Bolt — Composite: 8.7">
        <RadarChart
          axes={[
            { label: "Baseline", value: 9.2 },
            { label: "Synergy", value: 7.8 },
            { label: "Role", value: 8.5 },
            { label: "Curve", value: 6.2 },
            { label: "Castability", value: 9.5 },
            { label: "Signal", value: 7.0 },
            { label: "Color", value: 8.8 },
            { label: "Opp. Cost", value: 6.5 },
          ]}
          color="var(--color-positive)"
          size={260}
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="WeakPick">
  <div style="width: 350px;">
    <Panel>
      <Section title="Pick Analysis" subtitle="Demolition Field — Composite: 4.2">
        <RadarChart
          axes={[
            { label: "Baseline", value: 3.1 },
            { label: "Synergy", value: 2.5 },
            { label: "Role", value: 5.0 },
            { label: "Curve", value: 7.8 },
            { label: "Castability", value: 9.0 },
            { label: "Signal", value: 4.2 },
            { label: "Color", value: 3.0 },
            { label: "Opp. Cost", value: 2.1 },
          ]}
          color="var(--color-warning)"
          size={260}
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="ThreeAxis">
  <div style="width: 300px;">
    <Panel>
      <Section title="Stat Comparison">
        <RadarChart
          axes={[
            { label: "Offense", value: 85, max: 100 },
            { label: "Defense", value: 62, max: 100 },
            { label: "Utility", value: 74, max: 100 },
          ]}
          color="var(--color-highlight)"
          size={220}
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="MultiSeries">
  <div style="width: 400px;">
    <Panel>
      <Section title="Pick Comparison" subtitle="Lightning Bolt vs Demolition Field">
        <RadarChart
          labels={["Baseline", "Synergy", "Role", "Curve", "Castability", "Signal", "Color", "Opp. Cost"]}
          series={[
            { label: "Lightning Bolt", values: [9.2, 7.8, 8.5, 6.2, 9.5, 7.0, 8.8, 6.5], color: "var(--color-positive)" },
            { label: "Demolition Field", values: [3.1, 2.5, 5.0, 7.8, 9.0, 4.2, 3.0, 2.1], color: "var(--color-warning)" },
          ]}
          max={10}
          size={280}
        />
        <Divider decoration="none" />
        <LegendBar items={[
          { label: "Lightning Bolt", color: "var(--color-positive)" },
          { label: "Demolition Field", color: "var(--color-warning)" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
