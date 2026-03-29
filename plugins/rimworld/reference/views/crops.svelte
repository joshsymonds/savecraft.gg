<!--
  @component
  Crop production optimizer view.
  Shows growth stats, yield per tile, and tiles-to-feed as the hero number.
-->
<script lang="ts">
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Divider from "../../../../views/src/components/layout/Divider.svelte";

  interface Props {
    data: {
      crop: string;
      growth_rate: number;
      actual_grow_days: number;
      nutrition_per_day: number;
      silver_per_day: number;
      tiles_needed: number;
      hydroponics: boolean;
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  let growthVariant = $derived<"positive" | "warning" | "negative">(
    data.growth_rate >= 0.9 ? "positive" : data.growth_rate >= 0.5 ? "warning" : "negative",
  );
</script>

<Panel watermark={data.icon_url}>
  <Section title={data.crop}>
    {#snippet badge()}
      {#if data.hydroponics}
        <Badge label="HYDROPONICS" variant="info" />
      {/if}
    {/snippet}

    <div class="crop-layout">
      <div class="hero-stats">
        <div class="hero-stat">
          <Stat value={data.tiles_needed} label="Tiles per colonist" variant="highlight" />
        </div>
        <Divider direction="vertical" decoration="diamond" />
        <div class="hero-stat">
          <Stat value="{data.actual_grow_days.toFixed(1)}d" label="Days to harvest" variant="info" />
        </div>
      </div>

      <div class="details">
        <Panel nested>
          <span class="sub-label">Yield</span>
          <KeyValue items={[
            { key: "Nutrition/day/tile", value: data.nutrition_per_day.toFixed(3) },
            { key: "Silver/day/tile", value: data.silver_per_day.toFixed(3) },
          ]} />
        </Panel>
        <Panel nested>
          <span class="sub-label">Growth</span>
          <KeyValue items={[
            { key: "Growth rate", value: `${data.growth_rate.toFixed(2)}×`, variant: growthVariant },
            { key: "Grow days (base→actual)", value: `${data.actual_grow_days.toFixed(1)}d` },
          ]} />
        </Panel>
      </div>
    </div>
  </Section>
</Panel>

<style>
  .crop-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hero-stats {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-lg) 0;
  }

  .hero-stat {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

</style>
