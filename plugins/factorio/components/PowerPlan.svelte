<!--
  @component
  Factorio power plan visualization.
  Renders generation mix, entity counts, and fuel consumption
  for steam, solar, and nuclear power sources.

  @attribution wube
-->
<script lang="ts">
  import Stat from "../../../views/src/components/data/Stat.svelte";
  import StackedBar from "../../../views/src/components/charts/StackedBar.svelte";
  import DataTable from "../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../views/src/components/data/KeyValue.svelte";
  import FactorChain from "../../../views/src/components/data/FactorChain.svelte";
  import Panel from "../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../views/src/components/layout/Section.svelte";

  interface Source {
    type: string;
    generation_mw: number;
    entities: Record<string, number>;
    fuel?: {
      type?: string;
      fuel_per_min?: number;
      fuel_cells_per_min?: number;
    };
    layout?: string;
  }

  interface Props {
    data: {
      target_mw: number;
      total_generation_mw: number;
      surplus_mw: number;
      sources: Source[];
      existing_mw?: number;
      deficit_mw?: number;
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  const SOURCE_COLORS: Record<string, string> = {
    nuclear: "var(--color-info)",
    solar: "var(--color-warning)",
    steam: "var(--color-highlight)",
  };

  const SOURCE_LABELS: Record<string, string> = {
    nuclear: "Nuclear",
    solar: "Solar",
    steam: "Steam",
  };

  function formatMW(mw: number): string {
    if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
    if (mw >= 1) return `${mw.toFixed(1)} MW`;
    return `${(mw * 1000).toFixed(0)} kW`;
  }

  function formatEntityName(name: string): string {
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  let surplusVariant = $derived<"positive" | "info" | "negative">(
    data.surplus_mw > 0 ? "positive" : data.surplus_mw === 0 ? "info" : "negative",
  );

  let genSegments = $derived(
    data.sources
      .filter((s) => s.generation_mw > 0)
      .map((s) => ({
        label: SOURCE_LABELS[s.type] ?? s.type,
        value: s.generation_mw,
        color: SOURCE_COLORS[s.type] ?? "var(--color-text-muted)",
      })),
  );

  function entityTableColumns() {
    return [
      { key: "entity", label: "Entity" },
      { key: "count", label: "Count", align: "right" as const },
    ];
  }

  function entityTableRows(entities: Record<string, number>) {
    return Object.entries(entities)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        entity: formatEntityName(name),
        count,
      }));
  }

  function nuclearFuelChain(source: Source) {
    if (!source.fuel?.fuel_cells_per_min) return null;
    const fuelCellsPerMin = source.fuel.fuel_cells_per_min;
    const reactors = source.entities["nuclear-reactor"] ?? 0;
    return {
      factors: [
        { label: "Reactors", value: reactors },
        { label: "Fuel Cell / 200s", value: 1 },
        { label: "× 60s / 200s", value: 0.3 },
      ],
      result: {
        label: "Fuel Cells/min",
        value: fuelCellsPerMin,
        variant: "highlight" as const,
      },
    };
  }

  function sectionTitle(source: Source): string {
    const base = SOURCE_LABELS[source.type] ?? source.type;
    if (source.layout) return `${base} (${source.layout})`;
    return base;
  }

  function sectionAccent(source: Source): string {
    return SOURCE_COLORS[source.type] ?? "var(--color-text-muted)";
  }

  function steamKV(source: Source) {
    const items: Array<{ key: string; value: string; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }> = [];
    if (source.fuel?.type) {
      items.push({ key: "Fuel Type", value: formatEntityName(source.fuel.type) });
    }
    if (source.fuel?.fuel_per_min) {
      items.push({ key: "Fuel/min", value: source.fuel.fuel_per_min.toFixed(1), variant: "warning" });
    }
    items.push({ key: "Generation", value: formatMW(source.generation_mw), variant: "highlight" });
    return items;
  }

  function solarKV(source: Source) {
    const panels = source.entities["solar-panel"] ?? 0;
    const accumulators = source.entities["accumulator"] ?? 0;
    return [
      { key: "Solar Panels", value: panels.toLocaleString() },
      { key: "Accumulators", value: accumulators.toLocaleString() },
      { key: "Ratio", value: `${panels}:${accumulators} (25:21 optimal)` },
      { key: "Generation", value: formatMW(source.generation_mw), variant: "highlight" as const },
    ];
  }

  function nuclearKV(source: Source) {
    const items: Array<{ key: string; value: string; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }> = [];
    if (source.layout) {
      items.push({ key: "Layout", value: source.layout });
    }
    items.push({ key: "Generation", value: formatMW(source.generation_mw), variant: "highlight" });
    if (source.fuel?.fuel_cells_per_min) {
      items.push({ key: "Fuel Cells/min", value: source.fuel.fuel_cells_per_min.toFixed(2), variant: "warning" });
    }
    return items;
  }
</script>

<Panel watermark={data.icon_url}>
  <div class="power-layout">
    <Section title="Power Plan">
      <div class="hero-row">
        <Stat value={formatMW(data.target_mw)} label="Target" />
        <Stat value={formatMW(data.total_generation_mw)} label="Planned" variant="highlight" />
        <Stat value={data.surplus_mw >= 0 ? `+${formatMW(data.surplus_mw)}` : `-${formatMW(Math.abs(data.surplus_mw))}`} label="Surplus" variant={surplusVariant} />
        {#if data.existing_mw != null}
          <Stat value={formatMW(data.existing_mw)} label="Existing" variant="info" />
          <Stat
            value={formatMW(data.deficit_mw ?? 0)}
            label="Deficit"
            variant={data.deficit_mw != null && data.deficit_mw > 0 ? "negative" : "positive"}
          />
        {/if}
      </div>
    </Section>

    {#if genSegments.length > 1}
      <Section title="Generation Mix">
        <StackedBar segments={genSegments} />
      </Section>
    {/if}

    {#each data.sources as source}
      {#if source.generation_mw > 0}
        <Section title={sectionTitle(source)} accent={sectionAccent(source)}>
          {#if source.type === "solar"}
            <KeyValue items={solarKV(source)} />
          {:else}
            <div class="source-details">
              <Panel nested>
                <span class="sub-label">Entities</span>
                <DataTable columns={entityTableColumns()} rows={entityTableRows(source.entities)} />
              </Panel>

              {#if source.type === "nuclear"}
                <Panel nested>
                  <span class="sub-label">Summary</span>
                  <KeyValue items={nuclearKV(source)} />
                </Panel>
                {@const fuelChain = nuclearFuelChain(source)}
                {#if fuelChain}
                  <Panel nested>
                    <span class="sub-label">Fuel Consumption</span>
                    <FactorChain
                      factors={fuelChain.factors}
                      result={fuelChain.result}
                      precision={2}
                    />
                  </Panel>
                {/if}
              {:else if source.type === "steam"}
                <Panel nested>
                  <span class="sub-label">Summary</span>
                  <KeyValue items={steamKV(source)} />
                </Panel>
              {/if}
            </div>
          {/if}
        </Section>
      {/if}
    {/each}
  </div>
</Panel>

<style>
  .power-layout {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .hero-row {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) 0;
    justify-content: center;
    flex-wrap: wrap;
  }

  .source-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .sub-label {
    display: block;
    font-family: var(--font-pixel, monospace);
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin-bottom: var(--space-xs);
  }
</style>
