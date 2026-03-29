<!--
  @component
  Drug economy & addiction analyzer view.
  List mode: sortable table of all drugs.
  Detail mode: economy vs risk split.
  Production mode: crop-to-drug pipeline stats.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface DrugEntry {
    name: string;
    market_value: number;
    category: string;
    addictiveness: number;
    ingredients: string[];
  }

  interface Props {
    data: {
      // List mode
      drugs?: DrugEntry[];
      // Detail mode
      drug?: string;
      category?: string;
      market_value?: number;
      addictiveness?: number;
      work_amount?: number;
      // Production chain mode
      crop?: string;
      soil_fertility?: number;
      actual_grow_days?: number;
      leaves_per_day?: number;
      drugs_per_day?: number;
      silver_per_day?: number;
    };
  }

  let { data }: Props = $props();

  let isListMode = $derived(!!data.drugs);
  let isProductionMode = $derived(!!data.crop && !!data.silver_per_day);

  function categoryVariant(cat: string): "info" | "negative" | "positive" {
    if (cat === "Social") return "info";
    if (cat === "Hard") return "negative";
    return "positive"; // Medical
  }

  function addictionVariant(v: number): "positive" | "warning" | "negative" {
    if (v <= 0.01) return "positive";
    if (v <= 0.2) return "warning";
    return "negative";
  }

  let listColumns = [
    { key: "name", label: "Drug", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "market_value", label: "Value", align: "right" as const, sortable: true },
    { key: "addictiveness", label: "Addiction", align: "right" as const, sortable: true },
  ];

  let listRows = $derived(
    (data.drugs ?? []).map((d) => ({
      name: d.name,
      category: { value: d.category, variant: categoryVariant(d.category) } as const,
      market_value: d.market_value.toFixed(1),
      addictiveness: { value: `${(d.addictiveness * 100).toFixed(0)}%`, variant: addictionVariant(d.addictiveness) } as const,
    })),
  );
</script>

<Panel>
  {#if isListMode}
    <Section title="Drug Economy">
      <DataTable columns={listColumns} rows={listRows} sortKey="market_value" sortDir="desc" />
    </Section>
  {:else if isProductionMode}
    <Section title="{data.drug ?? 'Drug'} Production">
      {#snippet badge()}
        {#if data.category}
          <Badge label={data.category.toUpperCase()} variant={categoryVariant(data.category)} />
        {/if}
      {/snippet}

      <div class="production-layout">
        <div class="hero">
          <Stat value="{(data.silver_per_day ?? 0).toFixed(2)}" label="Silver/day/tile" variant="highlight" />
        </div>

        <KeyValue items={[
          { key: "Crop", value: data.crop ?? "unknown" },
          { key: "Grow days", value: `${(data.actual_grow_days ?? 0).toFixed(1)}d` },
          { key: "Leaves/day/tile", value: (data.leaves_per_day ?? 0).toFixed(3) },
          { key: "Drugs/day/tile", value: (data.drugs_per_day ?? 0).toFixed(4) },
          { key: "Soil fertility", value: `${(data.soil_fertility ?? 1).toFixed(1)}×` },
        ]} />
      </div>
    </Section>
  {:else}
    <Section title={data.drug ?? "Drug"}>
      {#snippet badge()}
        {#if data.category}
          <Badge label={data.category.toUpperCase()} variant={categoryVariant(data.category)} />
        {/if}
      {/snippet}

      <div class="detail-grid">
        <Panel nested>
          <span class="sub-label">Economy</span>
          <KeyValue items={[
            { key: "Market value", value: `${(data.market_value ?? 0).toFixed(1)}` },
            { key: "Work to craft", value: `${(data.work_amount ?? 0).toFixed(0)}` },
          ]} />
        </Panel>
        <Panel nested>
          <span class="sub-label">Risk</span>
          <KeyValue items={[
            { key: "Addiction chance", value: `${((data.addictiveness ?? 0) * 100).toFixed(0)}%`,
              variant: addictionVariant(data.addictiveness ?? 0) },
          ]} />
        </Panel>
      </div>
    </Section>
  {/if}
</Panel>

<style>
  .production-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hero {
    display: flex;
    justify-content: center;
    padding: var(--space-md) 0;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  .sub-label {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    display: block;
    margin-bottom: var(--space-sm);
  }
</style>
