<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import FactorChain from "./FactorChain.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/FactorChain",
    tags: ["autodocs"],
  });
</script>

<Story name="SurgerySuccess">
  <Panel padding="var(--space-xl)">
    <Section title="Surgery Factor Breakdown">
      <FactorChain
        factors={[
          { label: "Surgeon", value: 0.90, variant: "warning" },
          { label: "Bed", value: 1.10, variant: "positive" },
          { label: "Medicine", value: 1.00 },
          { label: "Difficulty", value: 1.00 },
        ]}
        result={{ label: "Success", value: 0.853, variant: "positive" }}
      />
    </Section>
  </Panel>
</Story>

<Story name="WeakSurgeon">
  <Panel padding="var(--space-xl)">
    <Section title="Surgery Factor Breakdown">
      <FactorChain
        factors={[
          { label: "Surgeon", value: 0.35, variant: "negative" },
          { label: "Bed", value: 0.80, variant: "warning" },
          { label: "Medicine", value: 0.60, variant: "warning" },
          { label: "Difficulty", value: 1.50, variant: "negative" },
        ]}
        result={{ label: "Success", value: 0.126, variant: "negative" }}
      />
    </Section>
  </Panel>
</Story>

<Story name="MaterialQuality">
  <Panel padding="var(--space-xl)">
    <Section title="Plasteel Sharp Armor">
      <FactorChain
        factors={[
          { label: "Material", value: 1.20, variant: "positive" },
          { label: "Quality", value: 1.25, variant: "positive" },
        ]}
        result={{ label: "Final", value: 1.50, variant: "highlight" }}
      />
    </Section>
  </Panel>
</Story>

<Story name="AdditiveCosts">
  <Panel padding="var(--space-xl)">
    <Section title="Research Chain Cost">
      <FactorChain
        factors={[
          { label: "Smithing", value: 500 },
          { label: "Machining", value: 1000 },
          { label: "Microelec.", value: 3000 },
        ]}
        result={{ label: "Total", value: 4500, variant: "highlight" }}
        operator="+"
        precision={0}
      />
    </Section>
  </Panel>
</Story>
