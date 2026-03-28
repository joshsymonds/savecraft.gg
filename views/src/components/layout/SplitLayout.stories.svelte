<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SplitLayout from "./SplitLayout.svelte";
  import Panel from "./Panel.svelte";
  import Section from "./Section.svelte";
  import Stat from "../data/Stat.svelte";
  import RadarChart from "../charts/RadarChart.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/SplitLayout",
    tags: ["autodocs"],
  });
</script>

<Story name="Vertical">
  <div style="width: 500px;">
    <Panel>
      <Section title="Draft Summary">
        <SplitLayout decoration="diamond">
          {#snippet primary()}
            <div style="display: flex; justify-content: space-around;">
              <Stat value="7-2" label="Record" variant="positive" />
              <Stat value="58.4%" label="Win Rate" variant="highlight" />
              <Stat value="3.2" label="ALSA" variant="info" />
            </div>
          {/snippet}
          {#snippet secondary()}
            <p style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);">
              Strong Dimir control build. Key picks: Sheoldred P1P1, Go for the Throat P1P3. Mana base was clean with 9/8 split.
            </p>
          {/snippet}
        </SplitLayout>
      </Section>
    </Panel>
  </div>
</Story>

<Story name="HorizontalChartAndStats">
  <div style="width: 600px;">
    <Panel>
      <Section title="Pick Analysis" subtitle="Lightning Bolt — Composite: 8.7">
        <SplitLayout direction="horizontal" decoration="cross">
          {#snippet primary()}
            <RadarChart
              axes={[
                { label: "Base", value: 9.2 },
                { label: "Synergy", value: 7.8 },
                { label: "Role", value: 8.5 },
                { label: "Curve", value: 6.2 },
                { label: "Cast", value: 9.5 },
                { label: "Signal", value: 7.0 },
              ]}
              color="var(--color-positive)"
              size={200}
            />
          {/snippet}
          {#snippet secondary()}
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <Stat value="8.7" label="Composite" variant="positive" />
              <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">
                Strongest removal spell in the format. High baseline with excellent castability. Slight curve concern at 1 CMC — pool already has 4 one-drops.
              </p>
            </div>
          {/snippet}
        </SplitLayout>
      </Section>
    </Panel>
  </div>
</Story>
