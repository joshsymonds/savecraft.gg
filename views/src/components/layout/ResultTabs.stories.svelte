<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ResultTabs from "./ResultTabs.svelte";
  import Panel from "./Panel.svelte";
  import Section from "./Section.svelte";
  import KeyValue from "../data/KeyValue.svelte";
  import Stat from "../data/Stat.svelte";
  import Divider from "./Divider.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/ResultTabs",
    tags: ["autodocs"],
  });
</script>

<script>
  const bosses = [
    { name: "Mephisto", diff: "Hell", chance: "1:1,832", mf: "300%" },
    { name: "Andariel", diff: "Hell", chance: "1:2,164", mf: "300%" },
    { name: "Baal", diff: "Hell", chance: "1:4,420", mf: "250%" },
    { name: "Diablo", diff: "Hell", chance: "1:3,876", mf: "275%" },
  ];
  const equipSlots = [
    { slot: "Helm", item: "Harlequin Crest" },
    { slot: "Armor", item: "Enigma" },
    { slot: "Weapon", item: "Heart of the Oak" },
    { slot: "Shield", item: "Spirit Monarch" },
    { slot: "Gloves", item: "Magefist" },
    { slot: "Boots", item: "War Traveler" },
    { slot: "Belt", item: "Arachnid Mesh" },
    { slot: "Amulet", item: "Mara's Kaleidoscope" },
  ];
  const longCards = [
    { name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", wr: "64.2%" },
    { name: "Sheoldred, the Apocalypse", wr: "65.8%" },
    { name: "Go for the Throat", wr: "58.4%" },
  ];
</script>

<Story name="TwoTabs">
  <div style="width: 550px;">
    <ResultTabs tabs={[{ label: "Harlequin Crest" }, { label: "Shako" }]}>
      {#snippet children(index)}
        <Panel>
          <Section
            title={index === 0 ? "Harlequin Crest" : "Shako"}
            accent={index === 0 ? "var(--color-rarity-legendary)" : "var(--color-text-muted)"}
          >
            <div style="display: flex; justify-content: center; padding: var(--space-md) 0;">
              <Stat
                value={index === 0 ? "1:1,832" : "1:290"}
                label={index === 0 ? "Unique Drop Chance" : "Base Drop Chance"}
                variant={index === 0 ? "highlight" : "muted"}
              />
            </div>
            <Panel nested>
              <KeyValue items={index === 0
                ? [
                    { key: "Base item", value: "Shako" },
                    { key: "Quality", value: "Unique", variant: "highlight" },
                    { key: "Top source", value: "Hell Mephisto" },
                    { key: "Magic Find", value: "300%" },
                  ]
                : [
                    { key: "Base item", value: "Shako" },
                    { key: "Quality", value: "Base", variant: "muted" },
                    { key: "Top source", value: "Hell Baal" },
                    { key: "Magic Find", value: "0%" },
                  ]} />
            </Panel>
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="FourTabs">
  <div style="width: 600px;">
    <ResultTabs tabs={bosses.map(b => ({ label: b.name }))}>
      {#snippet children(index)}
        <Panel>
          <Section title={bosses[index].name} subtitle={bosses[index].diff} accent="var(--color-rarity-legendary)">
            <div style="display: flex; justify-content: center; padding: var(--space-md) 0;">
              <Stat value={bosses[index].chance} label="Shako Drop Chance" variant="highlight" />
            </div>
            <Divider />
            <KeyValue items={[
              { key: "Difficulty", value: bosses[index].diff },
              { key: "Magic Find", value: bosses[index].mf },
              { key: "Players", value: "1" },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="ManyTabsScrolling">
  <div style="width: 400px;">
    <ResultTabs tabs={equipSlots.map(s => ({ label: s.item }))}>
      {#snippet children(index)}
        <Panel>
          <Section title={equipSlots[index].item} subtitle={equipSlots[index].slot}>
            <KeyValue items={[
              { key: "Slot", value: equipSlots[index].slot },
              { key: "Item", value: equipSlots[index].item, variant: "highlight" },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="LongLabels">
  <div style="width: 500px;">
    <ResultTabs tabs={longCards.map(c => ({ label: c.name }))}>
      {#snippet children(index)}
        <Panel>
          <Section title={longCards[index].name}>
            <KeyValue items={[
              { key: "GIH Win Rate", value: longCards[index].wr, variant: "positive" },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>

<Story name="SingleTabHidesBar">
  <div style="width: 550px;">
    <ResultTabs tabs={[{ label: "Only Result" }]}>
      {#snippet children(_index)}
        <Panel>
          <Section title="Surgery Calculator">
            <KeyValue items={[
              { key: "Success chance", value: "97.2%", variant: "positive" },
              { key: "Surgeon factor", value: "1.42" },
              { key: "Bed factor", value: "1.10" },
            ]} />
          </Section>
        </Panel>
      {/snippet}
    </ResultTabs>
  </div>
</Story>
