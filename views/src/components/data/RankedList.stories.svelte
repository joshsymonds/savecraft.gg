<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import RankedList from "./RankedList.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/RankedList",
    tags: ["autodocs"],
  });
</script>

<Story name="DraftPicks">
  <div style="width: 550px;">
    <Panel>
      <Section title="Pick Recommendations" subtitle="Pack 1, Pick 3 — Foundations of Arcavios">
        <RankedList items={[
          { rank: 1, label: "Lightning Bolt", sublabel: "Instant", value: 8.7, badge: { label: "A+", variant: "positive" } },
          { rank: 2, label: "Sheoldred, the Apocalypse", sublabel: "Legendary Creature — Phyrexian Praetor", value: 8.2, badge: { label: "A", variant: "positive" } },
          { rank: 3, label: "Go for the Throat", sublabel: "Instant", value: 7.1, badge: { label: "B+", variant: "info" } },
          { rank: 4, label: "Preacher of the Schism", sublabel: "Creature — Vampire Cleric", value: 6.4, badge: { label: "B", variant: "info" } },
          { rank: 5, label: "Demolition Field", sublabel: "Land", value: 4.2, badge: { label: "C", variant: "warning" } },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="TopCards">
  <div style="width: 450px;">
    <Panel>
      <Section title="Top Cards by GIH WR" count={10}>
        <RankedList items={[
          { rank: 1, label: "Sheoldred, the Apocalypse", value: "65.8%", variant: "positive" },
          { rank: 2, label: "Fable of the Mirror-Breaker", value: "64.2%", variant: "positive" },
          { rank: 3, label: "Lightning Bolt", value: "62.1%", variant: "positive" },
          { rank: 4, label: "Preacher of the Schism", value: "59.7%" },
          { rank: 5, label: "Go for the Throat", value: "58.4%" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="CutCandidates">
  <div style="width: 500px;">
    <Panel>
      <Section title="Cut Candidates" subtitle="Weakest cards in your pool">
        <RankedList items={[
          { rank: 1, label: "Goblin Banneret", sublabel: "Low synergy with control shell", value: 2.1, variant: "negative" },
          { rank: 2, label: "Dimir Guildmage", sublabel: "Off-color activation cost", value: 3.4, variant: "negative" },
          { rank: 3, label: "Mind Rot", sublabel: "Weak in aggressive meta", value: 4.0, variant: "warning" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
