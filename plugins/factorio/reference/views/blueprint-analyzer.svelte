<!--
  @component
  Factorio blueprint analyzer reference view.
  Renders decoded blueprint analysis: entity breakdown, production rates,
  module audit, and recommendations.

  @attribution wube
-->
<script lang="ts">
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import ResultTabs from "../../../../views/src/components/layout/ResultTabs.svelte";

  interface EntityBreakdown {
    count: number;
    entities: string[];
  }

  interface RecipeEntry {
    recipe: string;
    machine_type: string;
    machine_count: number;
    items_per_min: number;
    per_machine: number;
    output_item: string;
    productivity_bonus: number;
    effective_speed: number;
    beacon_count: number;
    module_slots?: number;
  }

  interface ModuleIssue {
    entity: string;
    recipe: string;
    empty_slots: number;
    total_slots: number;
  }

  interface ModuleAudit {
    total_slots: number;
    filled_slots: number;
    total_empty_slots: number;
    utilization_pct: number;
    issues: ModuleIssue[];
  }

  interface BlueprintData {
    label: string;
    entity_count: number;
    entity_breakdown: Record<string, EntityBreakdown>;
    recipe_analysis: RecipeEntry[];
    recipe_summary: Record<string, number>;
    module_summary: Record<string, number>;
    module_audit: ModuleAudit;
    recommendations: string[];
    unknown_recipes: string[];
  }

  interface Props {
    data: {
      type: "blueprint" | "blueprint_book";
      label: string;
      // Single blueprint fields
      entity_count?: number;
      entity_breakdown?: Record<string, EntityBreakdown>;
      recipe_analysis?: RecipeEntry[];
      module_audit?: ModuleAudit;
      recommendations?: string[];
      unknown_recipes?: string[];
      // Blueprint book fields
      blueprints?: BlueprintData[];
    };
    spriteBaseUrl?: string;
  }

  let { data }: Props = $props();

  function formatItemName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatMachineName(name: string): string {
    const short: Record<string, string> = {
      "assembling-machine-1": "AM1",
      "assembling-machine-2": "AM2",
      "assembling-machine-3": "AM3",
      "chemical-plant": "Chem Plant",
      "oil-refinery": "Refinery",
      "stone-furnace": "Furnace",
      "steel-furnace": "Steel Furnace",
      "electric-furnace": "E-Furnace",
    };
    return short[name] ?? formatItemName(name);
  }

  function utilizationVariant(pct: number): "positive" | "warning" | "negative" {
    if (pct >= 80) return "positive";
    if (pct >= 40) return "warning";
    return "negative";
  }

  // --- Derived data for single blueprint or first book entry ---

  let blueprints = $derived(
    data.type === "blueprint_book"
      ? data.blueprints ?? []
      : [data as unknown as BlueprintData]
  );

  let tabs = $derived(
    data.type === "blueprint_book"
      ? blueprints.map((bp) => ({ label: bp.label || "Blueprint" }))
      : []
  );

  let activeTab = $state(0);

  let active = $derived(blueprints[activeTab] ?? blueprints[0]);

  // Entity breakdown table
  let entityColumns = $derived([
    { key: "category", label: "Category" },
    { key: "count", label: "Count", align: "right" as const },
    { key: "types", label: "Entity Types" },
  ]);

  let entityRows = $derived(
    active?.entity_breakdown
      ? Object.entries(active.entity_breakdown)
          .filter(([, v]) => v.count > 0)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([cat, v]) => ({
            category: cat.charAt(0).toUpperCase() + cat.slice(1),
            count: v.count,
            types: v.entities.map(formatItemName).join(", "),
          }))
      : []
  );

  // Production analysis table
  let recipeColumns = $derived([
    { key: "recipe", label: "Recipe" },
    { key: "machine", label: "Machine" },
    { key: "count", label: "#", align: "right" as const },
    { key: "rate", label: "Items/min", align: "right" as const },
    { key: "beacons", label: "Beacons", align: "right" as const },
    { key: "prod", label: "Prod%", align: "right" as const },
  ]);

  let recipeRows = $derived(
    (active?.recipe_analysis ?? []).map((r) => ({
      recipe: formatItemName(r.recipe),
      machine: formatMachineName(r.machine_type),
      count: r.machine_count,
      rate: { value: r.items_per_min.toFixed(1), sortValue: r.items_per_min },
      beacons: r.beacon_count > 0 ? r.beacon_count : "\u2014",
      prod: r.productivity_bonus > 0
        ? { value: `+${(r.productivity_bonus * 100).toFixed(0)}%`, variant: "positive" as const }
        : "\u2014",
    }))
  );

  // Module audit
  let auditKV = $derived.by(() => {
    const audit = active?.module_audit;
    if (!audit) return [];
    return [
      { key: "Module Slots", value: `${audit.filled_slots}/${audit.total_slots}` },
      { key: "Utilization", value: `${audit.utilization_pct}%`, variant: utilizationVariant(audit.utilization_pct) },
      { key: "Empty Slots", value: audit.total_empty_slots },
    ];
  });

  let issueColumns = $derived([
    { key: "entity", label: "Machine" },
    { key: "recipe", label: "Recipe" },
    { key: "empty", label: "Empty Slots", align: "right" as const },
  ]);

  let issueRows = $derived(
    (active?.module_audit?.issues ?? []).map((i) => ({
      entity: formatMachineName(i.entity),
      recipe: formatItemName(i.recipe),
      empty: { value: i.empty_slots, variant: "warning" as const },
    }))
  );

  let recommendations = $derived(active?.recommendations ?? []);
  let unknownRecipes = $derived(active?.unknown_recipes ?? []);
</script>

<div class="blueprint-view">
  <Panel>
    {#if data.type === "blueprint_book" && tabs.length > 1}
      <ResultTabs {tabs} onchange={(i) => (activeTab = i)}>
        {#snippet children(_index)}
          {@render blueprintContent()}
        {/snippet}
      </ResultTabs>
    {:else}
      {@render blueprintContent()}
    {/if}
  </Panel>
</div>

{#snippet blueprintContent()}
  <div class="sections">
    <!-- Summary badges -->
    <Section title={active?.label || "Blueprint"}>
      <div class="badges">
        <Badge label="{active?.entity_count ?? 0} entities" variant="info" />
        {#if active?.module_audit}
          <Badge
            label="{active.module_audit.utilization_pct}% modules"
            variant={utilizationVariant(active.module_audit.utilization_pct)}
          />
        {/if}
        {#if unknownRecipes.length > 0}
          <Badge label="{unknownRecipes.length} unknown recipes" variant="warning" />
        {/if}
      </div>
    </Section>

    <!-- Entity breakdown -->
    {#if entityRows.length > 0}
      <Section title="Entities" count={active?.entity_count}>
        <DataTable columns={entityColumns} rows={entityRows} />
      </Section>
    {/if}

    <!-- Production analysis -->
    {#if recipeRows.length > 0}
      <Section title="Production Analysis" count={recipeRows.length}>
        <DataTable columns={recipeColumns} rows={recipeRows} sortKey="rate" sortDir="desc" />
      </Section>
    {/if}

    <!-- Module audit -->
    {#if active?.module_audit && active.module_audit.total_slots > 0}
      <Section title="Module Audit">
        <KeyValue items={auditKV} columns={2} />
        {#if issueRows.length > 0}
          <div class="audit-issues">
            <DataTable columns={issueColumns} rows={issueRows} />
          </div>
        {/if}
      </Section>
    {/if}

    <!-- Recommendations -->
    {#if recommendations.length > 0}
      <Section title="Recommendations">
        <ul class="recs">
          {#each recommendations as rec}
            <li>{rec}</li>
          {/each}
        </ul>
      </Section>
    {/if}
  </div>
{/snippet}

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .audit-issues {
    margin-top: 12px;
  }

  .recs {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .recs li {
    color: var(--color-text-secondary, #aaa);
    font-size: 13px;
    line-height: 1.4;
  }
</style>
