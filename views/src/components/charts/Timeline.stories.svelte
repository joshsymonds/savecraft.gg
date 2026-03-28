<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Timeline from "./Timeline.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/Timeline",
    tags: ["autodocs"],
  });
</script>

<Story name="DraftPicks">
  <div style="width: 500px;">
    <Panel>
      <Section title="Draft Timeline" subtitle="Foundations of Arcavios — Pack 1">
        <Timeline events={[
          { label: "Lightning Bolt", sublabel: "P1P1 — Instant", value: "A+", variant: "positive" },
          { label: "Sheoldred, the Apocalypse", sublabel: "P1P2 — Legendary Creature", value: "A", variant: "positive" },
          { label: "Go for the Throat", sublabel: "P1P3 — Instant", value: "B+", variant: "info" },
          { label: "Preacher of the Schism", sublabel: "P1P4 — Creature", value: "B", variant: "info" },
          { label: "Swamp", sublabel: "P1P5 — Basic Land", value: "D", variant: "muted" },
          { label: "Demolition Field", sublabel: "P1P6 — Land", value: "C", variant: "warning" },
          { label: "Duress", sublabel: "P1P7 — Sorcery", value: "C+", variant: "warning" },
          { label: "Mind Rot", sublabel: "P1P8 — Sorcery", value: "D", variant: "negative" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="SessionHistory">
  <div style="width: 450px;">
    <Panel>
      <Section title="Session History" subtitle="Today">
        <Timeline events={[
          { label: "Premier Draft", sublabel: "7-2 — Dimir Control", value: "7-2", variant: "positive" },
          { label: "Quick Draft", sublabel: "3-3 — Boros Aggro", value: "3-3", variant: "warning" },
          { label: "Premier Draft", sublabel: "1-3 — Simic Ramp", value: "1-3", variant: "negative" },
          { label: "Quick Draft", sublabel: "5-3 — Orzhov Midrange", value: "5-3", variant: "info" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="GameProgression">
  <div style="width: 450px;">
    <Panel>
      <Section title="Quest Progress" subtitle="Act V — Lord of Destruction">
        <Timeline events={[
          { label: "Siege on Harrogath", sublabel: "Completed", variant: "positive" },
          { label: "Rescue on Mount Arreat", sublabel: "Completed", variant: "positive" },
          { label: "Prison of Ice", sublabel: "Completed", variant: "positive" },
          { label: "Betrayal of Harrogath", sublabel: "In Progress", variant: "highlight" },
          { label: "Rite of Passage", sublabel: "Locked" },
          { label: "Eve of Destruction", sublabel: "Locked" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
