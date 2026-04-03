<!--
  @component
  Factorio factory health diagnosis view.
  Shows factory health score, critical alerts, item/fluid deficit and surplus
  analysis with machine gaps, cascade risks, tech recommendations,
  and overproduction suggestions.

  @attribution wube
-->
<script lang="ts">
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import FactorioIcon from "../../../../views/src/components/factorio/FactorioIcon.svelte";

  interface Consumer {
    recipe: string;
    item: string;
    rate: number;
    percent: number;
  }

  interface MachineGap {
    machine_type: string;
    current_count: number;
    effective_rate: number;
    additional_needed: number;
    recipe: string;
  }

  interface Cascade {
    downstream_count: number;
    impact_fraction: number;
  }

  interface ItemDiagnosis {
    item: string;
    produced_per_min: number;
    consumed_per_min: number;
    net_rate: number;
    severity: "critical" | "severe" | "moderate" | "healthy" | "surplus";
    consumers?: Consumer[];
    machine_gap?: MachineGap;
    cascade?: Cascade;
  }

  interface TechRecommendation {
    tech: string;
    recipe_unlocked: string;
    deficit_item: string;
    impact: string;
  }

  interface OverproductionEntry {
    item: string;
    surplus_rate: number;
    suggested_recipes: Array<{ recipe: string; product: string }>;
  }

  interface Props {
    data: {
      health_score: number;
      item_diagnoses: ItemDiagnosis[];
      fluid_diagnoses: ItemDiagnosis[];
      tech_recommendations: TechRecommendation[];
      overproduction: OverproductionEntry[];
      icon_url?: string;
    };
    spriteBaseUrl?: string;
  }

  let { data }: Props = $props();

  // Health score variant
  let healthVariant = $derived<"positive" | "info" | "negative">(
    data.health_score >= 80 ? "positive" : data.health_score >= 50 ? "info" : "negative",
  );

  // Critical alerts: items with critical or severe severity
  let criticalItems = $derived(
    data.item_diagnoses.filter((d) => d.severity === "critical" || d.severity === "severe"),
  );
  let criticalFluids = $derived(
    data.fluid_diagnoses.filter((d) => d.severity === "critical" || d.severity === "severe"),
  );

  // Bar chart data: deficits (negative net_rate) sorted by magnitude
  function deficitBars(diagnoses: ItemDiagnosis[]) {
    return diagnoses
      .filter((d) => d.net_rate < -0.1)
      .sort((a, b) => a.net_rate - b.net_rate)
      .slice(0, 10)
      .map((d) => ({
        label: formatName(d.item),
        value: Math.abs(d.net_rate),
        variant: d.severity === "critical" ? "negative" as const : "warning" as const,
        key: d.item,
      }));
  }

  function surplusBars(diagnoses: ItemDiagnosis[]) {
    return diagnoses
      .filter((d) => d.net_rate > 0.1)
      .sort((a, b) => b.net_rate - a.net_rate)
      .slice(0, 10)
      .map((d) => ({
        label: formatName(d.item),
        value: d.net_rate,
        variant: "positive" as const,
        key: d.item,
      }));
  }

  let itemDeficits = $derived(deficitBars(data.item_diagnoses));
  let itemSurpluses = $derived(surplusBars(data.item_diagnoses));
  let fluidDeficits = $derived(deficitBars(data.fluid_diagnoses));
  let fluidSurpluses = $derived(surplusBars(data.fluid_diagnoses));

  // Summary stats
  let totalItems = $derived(data.item_diagnoses.length);
  let totalFluids = $derived(data.fluid_diagnoses.length);
  let deficitCount = $derived(
    data.item_diagnoses.filter((d) => d.net_rate < -0.1).length +
      data.fluid_diagnoses.filter((d) => d.net_rate < -0.1).length,
  );

  function formatName(name: string): string {
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function severityVariant(severity: string): "negative" | "warning" | "info" | "positive" | "muted" {
    switch (severity) {
      case "critical":
        return "negative";
      case "severe":
        return "warning";
      case "moderate":
        return "info";
      case "surplus":
        return "positive";
      default:
        return "muted";
    }
  }

  function severityLabel(d: ItemDiagnosis): string {
    if (d.severity === "critical") return "Zero Production";
    if (d.severity === "severe") return `${Math.round((Math.abs(d.net_rate) / d.consumed_per_min) * 100)}% Deficit`;
    return d.severity;
  }
</script>

<Panel watermark={data.icon_url}>
  <div class="flow-layout">
    <!-- Health Score Hero -->
    <Section title="Factory Health" accent={data.health_score >= 80 ? "var(--color-positive)" : data.health_score >= 50 ? "var(--color-info)" : "var(--color-negative)"}>
      <div class="hero-row">
        <ProgressRing
          value={data.health_score}
          label={`${data.health_score}`}
          variant={healthVariant}
          size={100}
        />
        <div class="hero-stats">
          <Stat value={data.health_score} label="Health Score" variant={healthVariant} />
          <div class="summary-line">
            <Badge label="{totalItems} items" variant="muted" />
            <Badge label="{totalFluids} fluids" variant="muted" />
            {#if deficitCount > 0}
              <Badge label="{deficitCount} deficits" variant="negative" />
            {/if}
          </div>
        </div>
      </div>
    </Section>

    <!-- Critical Alerts -->
    {#if criticalItems.length > 0 || criticalFluids.length > 0}
      <Section title="Critical Alerts" count={criticalItems.length + criticalFluids.length} accent="var(--color-negative)">
        <div class="alerts-grid">
          {#each criticalItems as d}
            <Panel nested compact>
              <div class="alert-item">
                <FactorioIcon name={d.item} size={24} />
                <div class="alert-detail">
                  <span class="alert-name">{formatName(d.item)}</span>
                  <Badge label={severityLabel(d)} variant={severityVariant(d.severity)} />
                </div>
                <span class="alert-rate">{d.net_rate}/min</span>
              </div>
              {#if d.machine_gap}
                <div class="alert-meta">
                  Need {d.machine_gap.additional_needed} more {formatName(d.machine_gap.machine_type)}
                </div>
              {/if}
              {#if d.cascade}
                <div class="alert-meta">
                  Affects {d.cascade.downstream_count} downstream items ({Math.round(d.cascade.impact_fraction * 100)}% of factory)
                </div>
              {/if}
            </Panel>
          {/each}
          {#each criticalFluids as d}
            <Panel nested compact>
              <div class="alert-item">
                <FactorioIcon name={d.item} size={24} />
                <div class="alert-detail">
                  <span class="alert-name">{formatName(d.item)}</span>
                  <Badge label="{severityLabel(d)} (Fluid)" variant={severityVariant(d.severity)} />
                </div>
                <span class="alert-rate">{d.net_rate}/min</span>
              </div>
              {#if d.cascade}
                <div class="alert-meta">
                  Affects {d.cascade.downstream_count} downstream products ({Math.round(d.cascade.impact_fraction * 100)}% of factory)
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Item Flow -->
    {#if itemDeficits.length > 0 || itemSurpluses.length > 0}
      <Section title="Item Flow" subtitle="Belt logistics">
        {#if itemDeficits.length > 0}
          <Panel nested>
            <span class="sub-label">Deficits (items/min short)</span>
            <BarChart items={itemDeficits}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
        {#if itemSurpluses.length > 0}
          <Panel nested>
            <span class="sub-label">Surpluses (items/min excess)</span>
            <BarChart items={itemSurpluses}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
      </Section>
    {/if}

    <!-- Fluid Flow -->
    {#if fluidDeficits.length > 0 || fluidSurpluses.length > 0}
      <Section title="Fluid Flow" subtitle="Pipe logistics">
        {#if fluidDeficits.length > 0}
          <Panel nested>
            <span class="sub-label">Deficits (units/min short)</span>
            <BarChart items={fluidDeficits}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
        {#if fluidSurpluses.length > 0}
          <Panel nested>
            <span class="sub-label">Surpluses (units/min excess)</span>
            <BarChart items={fluidSurpluses}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
      </Section>
    {/if}

    <!-- Tech Recommendations -->
    {#if data.tech_recommendations.length > 0}
      <Section title="Tech Unlock Impact" count={data.tech_recommendations.length} accent="var(--color-info)">
        <KeyValue
          items={data.tech_recommendations.map((r) => ({
            key: formatName(r.tech),
            value: r.impact,
            variant: "info" as const,
          }))}
        />
      </Section>
    {/if}

    <!-- Overproduction -->
    {#if data.overproduction.length > 0}
      <Section title="Overproduction" count={data.overproduction.length} accent="var(--color-positive)">
        {#each data.overproduction as entry}
          <Panel nested>
            <div class="overprod-header">
              <FactorioIcon name={entry.item} size={20} />
              <span class="overprod-name">{formatName(entry.item)}</span>
              <Badge label="+{entry.surplus_rate}/min" variant="positive" />
            </div>
            <div class="overprod-suggestions">
              {#each entry.suggested_recipes.slice(0, 4) as recipe}
                <span class="suggestion">
                  <FactorioIcon name={recipe.product} size={16} />
                  {formatName(recipe.recipe)}
                </span>
              {/each}
            </div>
          </Panel>
        {/each}
      </Section>
    {/if}
  </div>
</Panel>

<style>
  .flow-layout {
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
  }

  .hero-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
  }

  .summary-line {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
    justify-content: center;
  }

  .alerts-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .alert-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .alert-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .alert-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .alert-rate {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-negative);
    white-space: nowrap;
  }

  .alert-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    padding-left: calc(24px + var(--space-sm));
    margin-top: 2px;
  }

  .sub-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: var(--space-xs);
    display: block;
  }

  .overprod-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .overprod-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  .overprod-suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding-left: calc(20px + var(--space-sm));
  }

  .suggestion {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-border) 10%, transparent);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }
</style>
