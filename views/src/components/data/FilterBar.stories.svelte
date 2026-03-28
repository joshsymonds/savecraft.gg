<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import FilterBar from "./FilterBar.svelte";
  import LegendBar from "./LegendBar.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";
  import Divider from "../layout/Divider.svelte";
  import BarChart from "../charts/BarChart.svelte";
  import RankedList from "./RankedList.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/FilterBar",
    tags: ["autodocs"],
  });
</script>

<script>
  let draftActive = $state(["positive", "info"]);
  let formatActive = $state(["premier"]);

  const allPicks = [
    { rank: 1, label: "Lightning Bolt", value: "A+", variant: "positive" },
    { rank: 2, label: "Sheoldred", value: "A", variant: "positive" },
    { rank: 3, label: "Go for the Throat", value: "B+", variant: "info" },
    { rank: 4, label: "Preacher", value: "B", variant: "info" },
    { rank: 5, label: "Swamp", value: "D", variant: "muted" },
    { rank: 6, label: "Mind Rot", value: "D", variant: "negative" },
  ];

  let filteredPicks = $derived(
    draftActive.length === 0
      ? allPicks
      : allPicks.filter((p) => draftActive.includes(p.variant ?? ""))
  );
</script>

<Story name="ComposedWithChart">
  <div style="width: 550px;">
    <Panel>
      <Section title="Win Rate by Format" subtitle="Last 30 days">
        <FilterBar
          filters={[
            { label: "Premier", value: "premier", color: "var(--color-positive)" },
            { label: "Quick", value: "quick", color: "var(--color-info)" },
            { label: "Traditional", value: "trad", color: "var(--color-warning)" },
          ]}
          active={formatActive}
          onchange={(v) => (formatActive = v)}
          multiSelect={false}
        />
        <BarChart items={[
          { label: "Foundations", value: 62.1, variant: "positive" },
          { label: "Duskmourn", value: 55.4, variant: "info" },
          { label: "Bloomburrow", value: 48.2, variant: "negative" },
          { label: "Outlaws", value: 57.8, variant: "info" },
        ]} maxValue={100} />
        <Divider decoration="none" />
        <LegendBar items={[
          { label: "Above Average", color: "var(--color-positive)" },
          { label: "Average", color: "var(--color-info)" },
          { label: "Below Average", color: "var(--color-negative)" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="DraftQualityFilter">
  <div style="width: 500px;">
    <Panel>
      <Section title="Draft Picks">
        <FilterBar
          filters={[
            { label: "Great", value: "positive", color: "var(--color-positive)" },
            { label: "Good", value: "info", color: "var(--color-info)" },
            { label: "Weak", value: "warning", color: "var(--color-warning)" },
            { label: "Bad", value: "negative", color: "var(--color-negative)" },
            { label: "Filler", value: "muted", color: "var(--color-text-muted)" },
          ]}
          active={draftActive}
          onchange={(v) => (draftActive = v)}
        />
        <RankedList items={filteredPicks} />
      </Section>
    </Panel>
  </div>
</Story>
