<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import OilChain from "./OilChain.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../views/src/components/layout/Section.svelte";

  import {
    advancedAllPetroleum,
    advancedWithLubricant,
    basicOil,
    coalLiquefaction,
    withProductivityModules,
  } from "./oil-fixtures";

  const { Story } = defineMeta({
    title: "Factorio/Components/OilChain",
    tags: ["autodocs"],
  });
</script>

<Story name="AdvancedAllPetroleum">
  <Panel>
    <Section title="Advanced Oil Processing — All Petroleum">
      <OilChain data={advancedAllPetroleum} />
    </Section>
  </Panel>
</Story>

<Story name="AdvancedWithLubricant">
  <Panel>
    <Section title="Advanced Oil Processing + Lubricant">
      <OilChain data={advancedWithLubricant} />
    </Section>
  </Panel>
</Story>

<Story name="BasicOil">
  <Panel>
    <Section title="Basic Oil Processing">
      <OilChain data={basicOil} />
    </Section>
  </Panel>
</Story>

<Story name="CoalLiquefaction">
  <Panel>
    <Section title="Coal Liquefaction">
      <OilChain data={coalLiquefaction} />
    </Section>
  </Panel>
</Story>

<Story name="WithProductivityModules">
  <Panel>
    <Section title="Advanced Oil + Productivity Modules">
      <OilChain data={withProductivityModules} />
    </Section>
  </Panel>
</Story>
