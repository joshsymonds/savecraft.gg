<!--
  @component
  Weapon & armor combat calculator view.
  Shows DPS as hero stat with accuracy breakdown for ranged or verb table for melee.
-->
<script lang="ts">
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Props {
    data: {
      weapon: string;
      type: "ranged" | "melee";
      // Ranged fields
      raw_dps?: number;
      accuracy?: number;
      dps_at_range?: number;
      damage_per_shot?: number;
      expected_damage?: number;
      // Melee fields
      true_dps?: number;
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  let dps = $derived(data.type === "ranged" ? data.dps_at_range ?? 0 : data.true_dps ?? 0);
  let dpsVariant = $derived<"positive" | "warning" | "negative">(
    dps >= 10 ? "positive" : dps >= 5 ? "warning" : "negative",
  );
</script>

<Panel watermark={data.icon_url}>
  <Section title={data.weapon}>
    {#snippet badge()}
      <Badge label={data.type === "ranged" ? "RANGED" : "MELEE"} variant={data.type === "ranged" ? "info" : "warning"} />
    {/snippet}

    <div class="combat-layout">
      <div class="hero">
        <Stat value={dps.toFixed(2)} label={data.type === "ranged" ? "DPS at range" : "True DPS"} variant={dpsVariant} />
      </div>

      {#if data.type === "ranged"}
        <Section title="Ranged Stats" accent="var(--color-info)">
          <KeyValue items={[
            { key: "Raw DPS", value: (data.raw_dps ?? 0).toFixed(2) },
            { key: "Accuracy", value: `${((data.accuracy ?? 0) * 100).toFixed(0)}%`,
              variant: (data.accuracy ?? 0) >= 0.7 ? "positive" : (data.accuracy ?? 0) >= 0.4 ? "warning" : "negative" },
            { key: "Damage/shot", value: (data.damage_per_shot ?? 0).toFixed(0) },
            ...(data.expected_damage != null && data.expected_damage !== data.damage_per_shot
              ? [{ key: "Expected vs armor", value: data.expected_damage.toFixed(1), variant: "warning" as const }]
              : []),
          ]} />
        </Section>
      {:else}
        <Section title="Melee Stats" accent="var(--color-warning)">
          <KeyValue items={[
            { key: "True DPS", value: (data.true_dps ?? 0).toFixed(2) },
          ]} />
        </Section>
      {/if}
    </div>
  </Section>
</Panel>

<style>
  .combat-layout {
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
