<!--
  @component
  Surgery success calculator view.
  Shows success probability as a prominent ring with factor chain breakdown.
-->
<script lang="ts">
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import FactorChain from "../../../../views/src/components/data/FactorChain.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Props {
    data: {
      success_chance: number;
      surgeon_factor: number;
      bed_factor: number;
      medicine_factor: number;
      difficulty: number;
      inspired: boolean;
      capped: boolean;
      uncapped: number;
    };
  }

  let { data }: Props = $props();

  let pct = $derived(Math.round(data.success_chance * 1000) / 10);
  let variant = $derived<"positive" | "negative" | "warning" | "highlight">(
    pct >= 90 ? "positive" : pct >= 60 ? "highlight" : pct >= 30 ? "warning" : "negative",
  );

  function factorVariant(v: number): "positive" | "negative" | "warning" | undefined {
    if (v >= 1.1) return "positive";
    if (v <= 0.7) return "negative";
    if (v < 1.0) return "warning";
    return undefined;
  }

  let factors = $derived([
    { label: "Surgeon", value: data.surgeon_factor, variant: factorVariant(data.surgeon_factor) },
    { label: "Bed", value: data.bed_factor, variant: factorVariant(data.bed_factor) },
    { label: "Medicine", value: data.medicine_factor, variant: factorVariant(data.medicine_factor) },
    { label: "Difficulty", value: data.difficulty, variant: factorVariant(data.difficulty) },
    ...(data.inspired ? [{ label: "Inspired", value: 2.0, variant: "positive" as const }] : []),
  ]);
</script>

<Panel>
  <Section title="Surgery Success" accent="var(--color-positive)">
    <div class="surgery-layout">
      <div class="hero">
        <ProgressRing value={pct} label="{pct}%" {variant} size={120} />
        <div class="badges">
          {#if data.capped}
            <Badge label="CAPPED AT 98%" variant="warning" />
          {/if}
          {#if data.inspired}
            <Badge label="Inspired Surgery" variant="legendary" />
          {/if}
        </div>
      </div>

      <div class="breakdown">
        <FactorChain
          {factors}
          result={{
            label: "Result",
            value: data.uncapped,
            variant: variant,
          }}
        />
      </div>
    </div>
  </Section>
</Panel>

<style>
  .surgery-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) 0;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .badges {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: center;
  }

  .breakdown {
    width: 100%;
  }
</style>
