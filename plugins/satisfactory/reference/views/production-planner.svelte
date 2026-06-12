<!--
  @component
  Production plan view: machines per recipe with power and clock totals,
  raw resource inputs, and byproducts for a target item + rate.
-->
<script lang="ts">
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Tag from "../../../../views/src/components/data/Tag.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface AmountEntry {
    name: string;
    className: string;
    perMinute: number;
    unit?: string;
  }

  interface MachineEntry {
    recipe: string;
    recipeClassName: string;
    building?: string;
    alternate: boolean;
    machines: number;
    machinesCeil: number;
    powerMW?: number;
    existingMachines?: number;
    unlockedAlternates?: string[];
  }

  interface Props {
    data: {
      target: string;
      ratePerMinute: number;
      machinesByRecipe: MachineEntry[];
      rawResources: AmountEntry[];
      byproducts: AmountEntry[];
      totalPowerMW: number;
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  const totalMachines = $derived(
    data.machinesByRecipe.reduce((sum, m) => sum + m.machinesCeil, 0),
  );
  const hasExisting = $derived(data.machinesByRecipe.some((m) => m.existingMachines !== undefined));
  const alternateHints = $derived(
    data.machinesByRecipe.filter((m) => (m.unlockedAlternates ?? []).length > 0),
  );

  const columns = $derived([
    { key: "recipe", label: "Recipe", sortable: true },
    { key: "building", label: "Building", sortable: true },
    { key: "machines", label: "Machines", align: "right" as const, sortable: true },
    { key: "ceil", label: "Build", align: "right" as const, sortable: true },
    ...(hasExisting ? [{ key: "existing", label: "Have", align: "right" as const, sortable: true }] : []),
    { key: "power", label: "MW", align: "right" as const, sortable: true },
  ]);

  const rows = $derived(
    data.machinesByRecipe.map((m) => ({
      recipe: m.alternate
        ? { value: `${m.recipe} (alt)`, variant: "highlight" as const }
        : m.recipe,
      building: m.building ?? "—",
      machines: { value: m.machines.toFixed(2), sortValue: m.machines },
      ceil: m.machinesCeil,
      existing:
        m.existingMachines !== undefined
          ? { value: m.existingMachines, variant: "positive" as const }
          : { value: "—", sortValue: 0 },
      power: m.powerMW !== undefined ? { value: m.powerMW.toFixed(1), sortValue: m.powerMW } : "—",
    })),
  );

  function rate(entry: AmountEntry): string {
    const unit = entry.unit === "m3" ? " m³/min" : "/min";
    return `${entry.perMinute}${unit}`;
  }
</script>

<Panel watermark={data.icon_url}>
  <div class="plan-layout">
  <Section title={`${data.target} — ${data.ratePerMinute}/min`}>
    <div class="stats">
      <Stat label="Machines" value={String(totalMachines)} />
      <Stat label="Power" value={`${data.totalPowerMW} MW`} />
      <Stat label="Raw inputs" value={String(data.rawResources.length)} />
    </div>
  </Section>

  <Section title="Machines by recipe">
    <DataTable {columns} {rows} sortKey="machines" sortDir="desc" />
  </Section>

  <Section title="Raw resources">
    <div class="chips">
      {#each data.rawResources as raw (raw.className)}
        <Tag label={`${raw.name} ${rate(raw)}`} variant="info" />
      {/each}
      {#if data.rawResources.length === 0}
        <span class="empty">none</span>
      {/if}
    </div>
  </Section>

  {#if data.byproducts.length > 0}
    <Section title="Byproducts">
      <div class="chips">
        {#each data.byproducts as bp (bp.className)}
          <Tag label={`${bp.name} ${rate(bp)}`} variant="warning" />
        {/each}
      </div>
    </Section>
  {/if}

  {#if alternateHints.length > 0}
    <Section title="Unlocked alternates available">
      <ul class="alternates">
        {#each alternateHints as hint (hint.recipeClassName)}
          <li>
            <strong>{hint.recipe}</strong>: {(hint.unlockedAlternates ?? []).join(", ")}
          </li>
        {/each}
      </ul>
    </Section>
  {/if}

  <p class="notes">
    Assumes 100% clock speed and no somersloops. Build counts round the exact
    machine requirement up to whole machines.
  </p>
  </div>
</Panel>

<style>
  .plan-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .stats {
    display: flex;
    gap: var(--space-6, 1.5rem);
    flex-wrap: wrap;
  }

  .chips {
    display: flex;
    gap: var(--space-2, 0.5rem);
    flex-wrap: wrap;
  }

  .empty {
    color: var(--color-text-muted, #888);
  }

  .alternates {
    margin: 0;
    padding-left: 1.2em;
  }

  .alternates li {
    margin-bottom: 0.25em;
  }

  .notes {
    color: var(--color-text-muted, #888);
    font-size: 0.85em;
    margin-bottom: 0;
  }
</style>
