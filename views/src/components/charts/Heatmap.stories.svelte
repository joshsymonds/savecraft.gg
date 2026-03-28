<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Heatmap from "./Heatmap.svelte";
  import Section from "../layout/Section.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/Heatmap",
    tags: ["autodocs"],
  });
</script>

<Story name="ArchetypeWinRates">
  <div style="width: 550px;">
    <Panel>
      <Section title="Archetype Win Rates" subtitle="GIH WR by color pair and set">
        <Heatmap
          columnLabels={["FDN", "DSK", "BLB", "OTJ"]}
          rows={[
            { label: "Boros", cells: [{ value: 55.2, label: "55.2%" }, { value: 58.1, label: "58.1%" }, { value: 51.3, label: "51.3%" }, { value: 54.0, label: "54.0%" }] },
            { label: "Dimir", cells: [{ value: 53.8, label: "53.8%" }, { value: 61.2, label: "61.2%" }, { value: 56.7, label: "56.7%" }, { value: 49.5, label: "49.5%" }] },
            { label: "Gruul", cells: [{ value: 50.1, label: "50.1%" }, { value: 52.4, label: "52.4%" }, { value: 59.8, label: "59.8%" }, { value: 55.2, label: "55.2%" }] },
            { label: "Orzhov", cells: [{ value: 48.5, label: "48.5%" }, { value: 54.9, label: "54.9%" }, { value: 52.1, label: "52.1%" }, { value: 57.3, label: "57.3%" }] },
            { label: "Simic", cells: [{ value: 56.7, label: "56.7%" }, { value: 49.3, label: "49.3%" }, { value: 53.5, label: "53.5%" }, { value: 60.1, label: "60.1%" }] },
          ]}
        />
      </Section>
    </Panel>
  </div>
</Story>

<Story name="DropQuality">
  <div style="width: 500px;">
    <Panel>
      <Section title="Drop Quality Tiers" subtitle="Baal (Hell) — probability per 1000 runs">
        <Heatmap
          columnLabels={["Unique", "Set", "Rare", "Magic"]}
          rows={[
            { label: "Arachnid Mesh", cells: [{ value: 35 }, { value: 0 }, { value: 191 }, { value: 520 }] },
            { label: "Crown of Ages", cells: [{ value: 20 }, { value: 0 }, { value: 112 }, { value: 380 }] },
            { label: "Griffon's Eye", cells: [{ value: 12 }, { value: 0 }, { value: 83 }, { value: 290 }] },
            { label: "Windforce", cells: [{ value: 7 }, { value: 0 }, { value: 29 }, { value: 150 }] },
          ]}
        />
      </Section>
    </Panel>
  </div>
</Story>
