<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import KeyValue from "./KeyValue.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/KeyValue",
    tags: ["autodocs"],
  });
</script>

<Story name="SingleColumn">
  <div style="width: 350px;">
    <Panel>
      <KeyValue items={[
        { key: "Class", value: "Paladin" },
        { key: "Level", value: 92, variant: "highlight" },
        { key: "Difficulty", value: "Hell" },
        { key: "Act", value: "Act V" },
        { key: "Gold", value: "2,847,320", variant: "highlight" },
      ]} />
    </Panel>
  </div>
</Story>

<Story name="TwoColumns">
  <div style="width: 500px;">
    <Panel>
      <KeyValue columns={2} items={[
        { key: "Strength", value: 156 },
        { key: "Dexterity", value: 75 },
        { key: "Vitality", value: 300, variant: "highlight" },
        { key: "Energy", value: 15 },
        { key: "Life", value: "3,420", variant: "positive" },
        { key: "Mana", value: "185", variant: "info" },
        { key: "Fire Res", value: "75%", variant: "positive" },
        { key: "Cold Res", value: "75%", variant: "positive" },
        { key: "Light Res", value: "43%", variant: "warning" },
        { key: "Poison Res", value: "-12%", variant: "negative" },
      ]} />
    </Panel>
  </div>
</Story>

<Story name="EquipmentStats">
  <div style="width: 350px;">
    <Panel accent="var(--color-rarity-legendary)">
      <Section title="Windforce" subtitle="Hydra Bow — Unique">
        <KeyValue items={[
          { key: "Damage", value: "11-375" },
          { key: "Attack Speed", value: "+20%", variant: "positive" },
          { key: "Knockback", value: "100%", variant: "info" },
          { key: "Mana Leech", value: "6-8%", variant: "info" },
          { key: "Strength", value: "+10", variant: "positive" },
          { key: "Dexterity", value: "+5", variant: "positive" },
        ]} />
      </Section>
    </Panel>
  </div>
</Story>
