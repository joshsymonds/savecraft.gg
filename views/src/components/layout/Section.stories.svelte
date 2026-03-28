<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Section from "./Section.svelte";
  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/Section",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 500px;">
    <Section title="Equipment">
      <Panel>
        <p style="font-family: var(--font-heading); color: var(--color-gold);">Helm of the Viper</p>
        <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Defense: 142 — Durability: 35/35</p>
      </Panel>
      <Panel>
        <p style="font-family: var(--font-heading); color: var(--color-gold);">Enigma Mage Plate</p>
        <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Defense: 775 — Durability: 60/60</p>
      </Panel>
    </Section>
  </div>
</Story>

<Story name="WithCount">
  <div style="width: 500px;">
    <Section title="Search Results" count={47}>
      <Panel>
        <p style="font-family: var(--font-heading); color: var(--color-text);">Sheoldred, the Apocalypse</p>
        <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">Legendary Creature — Phyrexian Praetor</p>
      </Panel>
      <Panel>
        <p style="font-family: var(--font-heading); color: var(--color-text);">Go for the Throat</p>
        <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">Instant</p>
      </Panel>
    </Section>
  </div>
</Story>

<Story name="WithSubtitle">
  <div style="width: 500px;">
    <Section title="Draft Review" subtitle="Foundations of Arcavios — Pack 1, Pick 3">
      <Panel>
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <p style="font-family: var(--font-heading); color: var(--color-text);">Lightning Bolt</p>
          <span style="font-family: var(--font-pixel); font-size: 10px; color: var(--color-positive);">A+</span>
        </div>
        <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-dim);">Composite: 8.7 — Baseline: 9.2, Synergy: 7.8</p>
      </Panel>
    </Section>
  </div>
</Story>
