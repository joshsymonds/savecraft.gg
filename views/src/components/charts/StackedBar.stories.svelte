<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import StackedBar from "./StackedBar.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/StackedBar",
    tags: ["autodocs"],
  });
</script>

<Story name="ManaDistribution">
  <div style="width: 450px;">
    <Panel>
      <Section title="Mana Distribution">
        <StackedBar segments={[
          { label: "White", value: 3, color: "#f0e8c8" },
          { label: "Blue", value: 7, color: "var(--color-info)" },
          { label: "Black", value: 5, color: "#a090b0" },
          { label: "Red", value: 2, color: "var(--color-negative)" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="WildcardCost">
  <div style="width: 450px;">
    <Panel>
      <Section title="Wildcard Cost" count={23}>
        <StackedBar segments={[
          { label: "Mythic", value: 4, color: "var(--color-rarity-legendary)" },
          { label: "Rare", value: 12, color: "var(--color-rarity-rare)" },
          { label: "Uncommon", value: 5, color: "var(--color-rarity-uncommon)" },
          { label: "Common", value: 2, color: "var(--color-rarity-common)" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="QualityBreakdown">
  <div style="width: 450px;">
    <Panel>
      <Section title="Equipment Quality">
        <StackedBar segments={[
          { label: "Legendary", value: 1, color: "var(--color-rarity-legendary)" },
          { label: "Excellent", value: 3, color: "var(--color-rarity-rare)" },
          { label: "Good", value: 5, color: "var(--color-rarity-uncommon)" },
          { label: "Normal", value: 4, color: "var(--color-rarity-common)" },
          { label: "Poor", value: 2, color: "var(--color-rarity-poor)" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
