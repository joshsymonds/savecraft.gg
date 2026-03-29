<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ResultTabs from "./ResultTabs.svelte";
  import Panel from "./Panel.svelte";
  import Section from "./Section.svelte";
  import KeyValue from "../data/KeyValue.svelte";
  import Stat from "../data/Stat.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/ResultTabs",
    tags: ["autodocs"],
  });
</script>

<Story name="TwoTabs">
  <div style="width: 550px;">
    <ResultTabs tabs={[{ label: "Harlequin Crest" }, { label: "Shako" }]}>
      {#snippet children(index)}
        <Panel>
          <Section title={index === 0 ? "Harlequin Crest" : "Shako"} accent="var(--color-rarity-legendary)">
            <KeyValue items={index === 0
              ? [
                  { key: "Base item", value: "Shako" },
                  { key: "Quality", value: "Unique", variant: "highlight" },
                  { key: "Top source", value: "Hell Mephisto" },
                  { key: "Chance", value: "1:1832" },
                ]
              : [
                  { key: "Base item", value: "Shako" },
                  { key: "Quality", value: "Base", variant: "muted" },
                  { key: "Top source", value: "Hell Baal" },
                  { key: "Chance", value: "1:290" },
                ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="FourTabs">
  <div style="width: 550px;">
    <ResultTabs tabs={[
      { label: "Mephisto" },
      { label: "Andariel" },
      { label: "Baal" },
      { label: "Diablo" },
    ]}>
      {#snippet children(index)}
        <Panel>
          <Section title={["Mephisto", "Andariel", "Baal", "Diablo"][index]}>
            <div style="display: flex; justify-content: center; padding: var(--space-md) 0;">
              <Stat value={[97, 42, 156, 88][index]} label="Total Raid Points" variant="info" />
            </div>
            <KeyValue items={[
              { key: "Difficulty", value: "Hell" },
              { key: "Players", value: "1" },
              { key: "Magic Find", value: `${[300, 200, 400, 350][index]}%` },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="SingleTab">
  <div style="width: 550px;">
    <ResultTabs tabs={[{ label: "Only Result" }]}>
      {#snippet children(_index)}
        <Panel>
          <Section title="Single Result">
            <KeyValue items={[
              { key: "Status", value: "No tab bar shown" },
              { key: "Reason", value: "Single result needs no tabs" },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>
