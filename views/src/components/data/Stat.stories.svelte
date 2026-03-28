<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Stat from "./Stat.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/Stat",
    tags: ["autodocs"],
  });
</script>

<Story name="Percentage">
  <Panel>
    <Stat value="85.5%" label="Surgery Success" variant="positive" />
  </Panel>
</Story>

<Story name="Count">
  <Panel>
    <Stat value={47} label="Cards Found" />
  </Panel>
</Story>

<Story name="Grade">
  <Panel>
    <Stat value="A+" label="Pick Quality" variant="positive" />
  </Panel>
</Story>

<Story name="NegativeValue">
  <Panel>
    <Stat value="32.1%" label="Win Rate" variant="negative" />
  </Panel>
</Story>

<Story name="StatRow">
  <Panel padding="var(--space-lg) var(--space-xl)">
    <div style="display: flex; justify-content: space-around; gap: 24px;">
      <Stat value="142" label="Matches" />
      <Stat value="58.4%" label="Win Rate" variant="positive" />
      <Stat value="3.2" label="Avg Wins" variant="info" />
      <Stat value="1.8" label="Avg Losses" variant="negative" />
    </div>
  </Panel>
</Story>
