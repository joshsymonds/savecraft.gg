<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import BarChart from "./BarChart.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/BarChart",
    tags: ["autodocs"],
  });
</script>

<Story name="WinRates">
  <div style="width: 500px;">
    <Panel>
      <Section title="Win Rate by Format">
        <BarChart items={[
          { label: "Premier Draft", value: 59.2, variant: "positive" },
          { label: "Quick Draft", value: 52.5, variant: "warning" },
          { label: "Traditional", value: 66.7, variant: "positive" },
          { label: "Sealed", value: 48.1, variant: "negative" },
        ]} maxValue={100} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="Resistances">
  <div style="width: 450px;">
    <Panel>
      <Section title="Resistances" subtitle="Hell Difficulty">
        <BarChart items={[
          { label: "Fire", value: 75, variant: "positive" },
          { label: "Cold", value: 75, variant: "positive" },
          { label: "Lightning", value: 43, variant: "warning" },
          { label: "Poison", value: -12, variant: "negative" },
        ]} maxValue={75} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="CropYield">
  <div style="width: 500px;">
    <Panel>
      <Section title="Silver per Day" subtitle="Best crops for Spring, Year 2">
        <BarChart items={[
          { label: "Strawberry", value: 142, variant: "highlight" },
          { label: "Cauliflower", value: 98 },
          { label: "Potato", value: 67 },
          { label: "Kale", value: 55 },
          { label: "Parsnip", value: 32 },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
