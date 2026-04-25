<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import GroupedTable from "./GroupedTable.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/GroupedTable",
    tags: ["autodocs"],
  });

  // Build comparison: columns are builds, rows are categorically
  // grouped axes. The category bars span all columns once per
  // section; build identifications appear once at the top.
  const columns = [
    { key: "axis", label: "", align: "left", width: "30%" },
    { key: "a", label: "Occultist L95", align: "right" },
    { key: "b", label: "Berserker L94", align: "right" },
  ];

  const groups = [
    {
      label: "Summary",
      rows: [
        { axis: "Combined DPS", a: "1.25M", b: { value: "2.50M", variant: "highlight" } },
        { axis: "Life", a: "4,891", b: { value: "7,200", variant: "highlight" } },
        { axis: "Energy Shield", a: { value: "2,104", variant: "highlight" }, b: "0" },
      ],
    },
    {
      label: "Allocated Tree",
      rows: [
        { axis: "Common nodes", a: "32", b: "32" },
        { axis: "Unique to this build", a: "8", b: "6" },
      ],
    },
    {
      label: "Gear",
      rows: [
        { axis: "Helmet", a: "Atziri's Foible", b: "Devoto's Devotion" },
        { axis: "Body Armour", a: "Kintsugi", b: { value: "—", variant: "muted" } },
        { axis: "Boots", a: { value: "—", variant: "muted" }, b: "Goldwyrm" },
      ],
    },
    {
      label: "Skills",
      rows: [
        {
          axis: "Cyclone Setup",
          a: "Cyclone, Pulverise, Brutality",
          b: "Cyclone, Brutality, Inspiration",
        },
        { axis: "Aura Setup", a: "Discipline, Determination", b: { value: "—", variant: "muted" } },
      ],
    },
  ];
</script>

<Story name="Build Comparison">
  <div style="max-width: 700px;">
    <Panel>
      <Section title="Build Comparison" subtitle="2 builds · 2 resolved">
        <GroupedTable {columns} {groups} />
      </Section>
    </Panel>
  </div>
</Story>

<!-- Standalone (no Panel) — verifies the table renders cleanly outside a containing Section. -->
<Story name="Standalone">
  <div style="max-width: 700px; padding: var(--space-lg);">
    <GroupedTable {columns} {groups} />
  </div>
</Story>

<!-- Custom group accent color -->
<Story name="Custom Accents">
  <div style="max-width: 700px;">
    <Panel>
      <Section title="With Accents">
        <GroupedTable
          columns={[
            { key: "axis", label: "Stat", align: "left", width: "40%" },
            { key: "a", label: "Build A", align: "right" },
            { key: "b", label: "Build B", align: "right" },
          ]}
          groups={[
            {
              label: "Offense",
              accent: "var(--color-warning)",
              rows: [{ axis: "DPS", a: "1.2M", b: "2.5M" }],
            },
            {
              label: "Defense",
              accent: "var(--color-info)",
              rows: [{ axis: "Life", a: "4,891", b: "7,200" }],
            },
          ]}
        />
      </Section>
    </Panel>
  </div>
</Story>
