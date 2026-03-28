<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import DataTable from "./DataTable.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/DataTable",
    tags: ["autodocs"],
  });
</script>

<Story name="CardStats">
  <div style="width: 700px;">
    <Panel>
      <Section title="Set Overview" subtitle="Foundations of Arcavios" count={142}>
        <DataTable
          columns={[
            { key: "name", label: "Card" },
            { key: "gihwr", label: "GIH WR", align: "right", sortable: true },
            { key: "ohwr", label: "OH WR", align: "right", sortable: true },
            { key: "gdwr", label: "GD WR", align: "right", sortable: true },
            { key: "iwd", label: "IWD", align: "right", sortable: true },
            { key: "games", label: "Games", align: "right", sortable: true },
          ]}
          rows={[
            { name: "Lightning Bolt", gihwr: 62.1, ohwr: 65.3, gdwr: 59.4, iwd: 4.2, games: 5200 },
            { name: "Sheoldred, the Apocalypse", gihwr: 65.8, ohwr: 68.1, gdwr: 63.2, iwd: 7.8, games: 1800 },
            { name: "Go for the Throat", gihwr: 58.4, ohwr: 60.1, gdwr: 56.8, iwd: 2.1, games: 3100 },
            { name: "Preacher of the Schism", gihwr: 59.7, ohwr: 62.0, gdwr: 57.5, iwd: 3.4, games: 2400 },
            { name: "Fable of the Mirror-Breaker", gihwr: 64.2, ohwr: 67.5, gdwr: 61.0, iwd: 6.5, games: 2100 },
          ]}
          sortKey="gihwr"
          sortDir="desc"
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="DropTable">
  <div style="width: 600px;">
    <Panel>
      <Section title="Drop Table" subtitle="Baal (Hell) — 100 MF, 8 Players">
        <DataTable
          columns={[
            { key: "item", label: "Item" },
            { key: "unique", label: "Unique", align: "right", sortable: true },
            { key: "set", label: "Set", align: "right", sortable: true },
            { key: "rare", label: "Rare", align: "right", sortable: true },
          ]}
          rows={[
            { item: "Arachnid Mesh", unique: "1:2,847", set: "—", rare: "1:523" },
            { item: "Crown of Ages", unique: "1:5,120", set: "—", rare: "1:891" },
            { item: "Griffon's Eye", unique: "1:8,340", set: "—", rare: "1:1,205" },
            { item: "Death's Fathom", unique: "1:12,500", set: "—", rare: "1:2,100" },
            { item: "Windforce", unique: "1:15,230", set: "—", rare: "1:3,400" },
          ]}
          sortKey="unique"
          sortDir="asc"
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="Simple">
  <div style="width: 400px;">
    <Panel>
      <DataTable
        columns={[
          { key: "format", label: "Format" },
          { key: "wins", label: "W", align: "right", sortable: true },
          { key: "losses", label: "L", align: "right", sortable: true },
          { key: "wr", label: "WR %", align: "right", sortable: true },
        ]}
        rows={[
          { format: "Premier Draft", wins: 84, losses: 58, wr: "59.2%" },
          { format: "Quick Draft", wins: 42, losses: 38, wr: "52.5%" },
          { format: "Traditional", wins: 16, losses: 8, wr: "66.7%" },
        ]}
      />
    </Panel>
  </div>
</Story>
