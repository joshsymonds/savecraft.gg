<!--
  @component
  Raid threat estimator view.
  Shows total raid points as hero number with wealth vs colonist breakdown.
-->
<script lang="ts">
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import StackedBar from "../../../../views/src/components/charts/StackedBar.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Props {
    data: {
      total_wealth: number;
      wealth_points: number;
      pawn_points: number;
      total_points: number;
    };
  }

  let { data }: Props = $props();

  let threatVariant = $derived<"positive" | "warning" | "negative">(
    data.total_points >= 2000 ? "negative" : data.total_points >= 500 ? "warning" : "positive",
  );
</script>

<Panel>
  <Section title="Raid Threat Estimate" accent="var(--color-negative)">
    <div class="raid-layout">
      <div class="hero">
        <Stat value={Math.round(data.total_points)} label="Total Raid Points" variant={threatVariant} />
      </div>

      <Panel nested>
        <span class="sub-label">Point Breakdown</span>
        <StackedBar segments={[
          { label: "From wealth", value: data.wealth_points, color: "var(--color-warning)" },
          { label: "From colonists", value: data.pawn_points, color: "var(--color-info)" },
        ]} />
      </Panel>

      <Panel nested>
        <span class="sub-label">Colony Wealth</span>
        <KeyValue items={[
          { key: "Effective wealth", value: Math.round(data.total_wealth).toLocaleString() },
          { key: "Wealth points", value: Math.round(data.wealth_points).toLocaleString() },
          { key: "Colonist points", value: Math.round(data.pawn_points).toLocaleString() },
        ]} />
      </Panel>
    </div>
  </Section>
</Panel>

<style>
  .raid-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hero {
    display: flex;
    justify-content: center;
    padding: var(--space-md) 0;
  }

</style>
