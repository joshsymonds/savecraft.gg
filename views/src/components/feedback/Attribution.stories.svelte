<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Attribution from "../../Attribution.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";
  import BarChart from "../charts/BarChart.svelte";
  import Divider from "../layout/Divider.svelte";
  import LegendBar from "../data/LegendBar.svelte";

  const { Story } = defineMeta({
    title: "Components/Feedback/Attribution",
    tags: ["autodocs"],
  });
</script>

<Story name="AfterChart">
  <div style="width: 500px;">
    <Panel>
      <Section title="Win Rate by Set" subtitle="Premier Draft — Last 30 days">
        <BarChart items={[
          { label: "Foundations", value: 62.1, variant: "positive" },
          { label: "Duskmourn", value: 55.4, variant: "info" },
          { label: "Bloomburrow", value: 48.2, variant: "negative" },
        ]} maxValue={100} />
        <Divider decoration="none" />
        <LegendBar items={[
          { label: "Above Average", color: "var(--color-positive)" },
          { label: "Average", color: "var(--color-info)" },
          { label: "Below Average", color: "var(--color-negative)" },
        ]} />
      </Section>
    </Panel>
    <Attribution entries={[
      { name: "Wizards of the Coast", disclaimer: "Savecraft is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. \u00a9Wizards of the Coast LLC.", url: "https://company.wizards.com/en/legal/fancontentpolicy" },
      { name: "17Lands", disclaimer: "Not produced by, endorsed by, supported by, or affiliated with 17Lands, LLC. \u00a9 17Lands, LLC.", url: "https://www.17lands.com" },
    ]} />
  </div>
</Story>

<Story name="SingleSource">
  <div style="width: 400px;">
    <Panel>
      <Section title="Crop Planner">
        <p style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);">
          Best crops for Spring, Year 2 based on your farming level and soil quality.
        </p>
      </Section>
    </Panel>
    <Attribution entries={[
      { name: "ConcernedApe", disclaimer: "ConcernedApe\u2122, Stardew Valley\u00ae are trademarks of ConcernedApe LLC. Not affiliated with or endorsed by ConcernedApe.", url: "https://www.stardewvalley.net/terms/" },
    ]} />
  </div>
</Story>

<Story name="ManySourcesNarrow">
  <div style="width: 320px;">
    <Panel>
      <Section title="Card Search" count={5}>
        <p style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);">5 cards found matching your query.</p>
      </Section>
    </Panel>
    <Attribution entries={[
      { name: "Wizards of the Coast", disclaimer: "Savecraft is unofficial Fan Content.", url: "https://company.wizards.com/en/legal/fancontentpolicy" },
      { name: "Scryfall", disclaimer: "Not produced by or affiliated with Scryfall, LLC.", url: "https://scryfall.com/docs/api" },
      { name: "17Lands", disclaimer: "Not produced by or affiliated with 17Lands, LLC.", url: "https://www.17lands.com" },
    ]} />
  </div>
</Story>
