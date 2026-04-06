<!--
  @component
  Factorio factory diagnosis view.
  Shows deficits with root cause chains, bottleneck classification,
  machine gaps, surplus connections, and tech recommendations.

  @attribution wube
-->
<script lang="ts">
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import FactorioIcon from "../../../../views/src/components/factorio/FactorioIcon.svelte";
  import type { SpriteConfig } from "../../../../views/src/components/factorio/factorio-icons";

  import itemManifest from "../../sprites/items.json";
  import fluidManifest from "../../sprites/fluids.json";

  interface Consumer {
    recipe: string;
    item: string;
    rate: number;
    percent: number;
    is_recycling: boolean;
  }

  interface MachineGap {
    machine_type: string;
    current_count: number;
    effective_rate: number;
    additional_needed: number;
    recipe: string;
  }

  interface RootCause {
    chain: string[];
    root_item: string;
    bottleneck_type: "not_built" | "input_starvation" | "throughput";
  }

  interface ItemDiagnosis {
    item: string;
    produced_per_min: number;
    consumed_per_min: number;
    real_consumed: number;
    recycler_consumed: number;
    net_rate: number;
    severity: "critical" | "severe" | "moderate" | "healthy" | "surplus";
    consumers?: Consumer[];
    machine_gap?: MachineGap;
    root_cause?: RootCause;
  }

  interface SurplusConnection {
    surplus: string;
    surplus_rate: number;
    deficit: string;
    recipe: string;
  }

  interface TechRecommendation {
    tech: string;
    recipes_unlocked: string[];
    deficit_items: string[];
    inputs_available: boolean;
  }

  interface Props {
    data: {
      item_diagnoses: ItemDiagnosis[];
      fluid_diagnoses: ItemDiagnosis[];
      tech_recommendations: TechRecommendation[];
      surplus_connections: SurplusConnection[];
      icon_url?: string;
    };
    spriteBaseUrl?: string;
  }

  let { data, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

  let itemSpriteConfig: SpriteConfig = $derived({
    url: `${spriteBaseUrl}/items.png`,
    sheetWidth: 2048,
    sheetHeight: 704,
    manifest: itemManifest,
  });

  let fluidSpriteConfig: SpriteConfig = $derived({
    url: `${spriteBaseUrl}/fluids.png`,
    sheetWidth: 2048,
    sheetHeight: 128,
    manifest: fluidManifest,
  });

  function getSpriteConfig(iconName: string): SpriteConfig {
    if (fluidManifest[iconName as keyof typeof fluidManifest]) return fluidSpriteConfig;
    return itemSpriteConfig;
  }

  // Deficit items sorted by severity then magnitude
  let allDeficits = $derived(
    [...data.item_diagnoses, ...data.fluid_diagnoses]
      .filter((d) => d.net_rate < -0.1)
      .sort((a, b) => a.net_rate - b.net_rate),
  );

  let criticalDeficits = $derived(allDeficits.filter((d) => d.severity === "critical" || d.severity === "severe"));
  let moderateDeficits = $derived(allDeficits.filter((d) => d.severity === "moderate"));

  // Bar chart data
  function deficitBars(diagnoses: ItemDiagnosis[]) {
    return diagnoses
      .filter((d) => d.net_rate < -0.1)
      .sort((a, b) => a.net_rate - b.net_rate)
      .slice(0, 10)
      .map((d) => ({
        label: formatName(d.item),
        value: Math.abs(d.net_rate),
        variant: (d.severity === "critical" ? "negative" : "warning") as "negative" | "warning",
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
  let deficitCount = $derived(allDeficits.length);
  let activeItems = $derived(data.item_diagnoses.length + data.fluid_diagnoses.length);

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

  function bottleneckLabel(type: string): string {
    switch (type) {
      case "not_built":
        return "Not Built";
      case "input_starvation":
        return "Input Starved";
      case "throughput":
        return "Need More Machines";
      default:
        return type;
    }
  }

  function bottleneckVariant(type: string): "negative" | "warning" | "info" {
    switch (type) {
      case "not_built":
        return "negative";
      case "input_starvation":
        return "warning";
      default:
        return "info";
    }
  }
</script>

<Panel watermark={data.icon_url}>
  <div class="flow-layout">
    <!-- Summary -->
    <Section title="Factory Diagnosis" accent={criticalDeficits.length > 0 ? "var(--color-negative)" : deficitCount > 0 ? "var(--color-warning)" : "var(--color-positive)"}>
      <div class="summary-row">
        <Stat value={activeItems} label="Active Items" variant="muted" />
        <Stat value={deficitCount} label="Deficits" variant={deficitCount > 0 ? "negative" : "positive"} />
        <Stat value={criticalDeficits.length} label="Critical" variant={criticalDeficits.length > 0 ? "negative" : "muted"} />
      </div>
    </Section>

    <!-- Critical & Severe Deficits with Root Causes -->
    {#if criticalDeficits.length > 0}
      <Section title="Bottlenecks" count={criticalDeficits.length} accent="var(--color-negative)">
        <div class="alerts-grid">
          {#each criticalDeficits as d}
            <Panel nested compact>
              <div class="alert-item">
                <FactorioIcon name={d.item} size={24} spriteConfig={getSpriteConfig(d.item)} />
                <div class="alert-detail">
                  <span class="alert-name">{formatName(d.item)}</span>
                  <div class="alert-badges">
                    <Badge label={d.severity === "critical" ? "Critical" : "Severe"} variant={severityVariant(d.severity)} />
                    {#if d.root_cause}
                      <Badge label={bottleneckLabel(d.root_cause.bottleneck_type)} variant={bottleneckVariant(d.root_cause.bottleneck_type)} />
                    {/if}
                  </div>
                </div>
                <span class="alert-rate">{d.net_rate}/min</span>
              </div>
              {#if d.root_cause && d.root_cause.chain.length > 1}
                <div class="root-chain">
                  {#each d.root_cause.chain as chainItem, i}
                    {#if i > 0}<span class="chain-arrow">←</span>{/if}
                    <span class="chain-item" class:chain-root={i === d.root_cause.chain.length - 1}>
                      <FactorioIcon name={chainItem} size={14} spriteConfig={getSpriteConfig(chainItem)} />
                      {formatName(chainItem)}
                    </span>
                  {/each}
                </div>
              {/if}
              {#if d.machine_gap}
                <div class="alert-meta">
                  Need {d.machine_gap.additional_needed} more {formatName(d.machine_gap.machine_type)}
                </div>
              {/if}
              {#if d.consumers && d.consumers.filter((c) => !c.is_recycling).length > 0}
                <div class="consumers">
                  {#each d.consumers.filter((c) => !c.is_recycling).slice(0, 3) as c}
                    <span class="consumer">
                      <FactorioIcon name={c.item} size={14} spriteConfig={getSpriteConfig(c.item)} />
                      {formatName(c.recipe)} ({c.percent}%)
                    </span>
                  {/each}
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Moderate Deficits -->
    {#if moderateDeficits.length > 0}
      <Section title="Minor Deficits" count={moderateDeficits.length} accent="var(--color-info)">
        <div class="alerts-grid">
          {#each moderateDeficits as d}
            <Panel nested compact>
              <div class="alert-item">
                <FactorioIcon name={d.item} size={20} spriteConfig={getSpriteConfig(d.item)} />
                <div class="alert-detail">
                  <span class="alert-name">{formatName(d.item)}</span>
                  {#if d.root_cause}
                    <Badge label={bottleneckLabel(d.root_cause.bottleneck_type)} variant={bottleneckVariant(d.root_cause.bottleneck_type)} />
                  {/if}
                </div>
                <span class="alert-rate-moderate">{d.net_rate}/min</span>
              </div>
              {#if d.machine_gap}
                <div class="alert-meta">
                  Need {d.machine_gap.additional_needed} more {formatName(d.machine_gap.machine_type)}
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Item Flow Charts -->
    {#if itemDeficits.length > 0 || itemSurpluses.length > 0}
      <Section title="Item Flow">
        {#if itemDeficits.length > 0}
          <Panel nested>
            <span class="sub-label">Deficits (items/min short)</span>
            <BarChart items={itemDeficits}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} spriteConfig={getSpriteConfig(item.key ?? item.label)} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
        {#if itemSurpluses.length > 0}
          <Panel nested>
            <span class="sub-label">Surpluses (items/min excess)</span>
            <BarChart items={itemSurpluses}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} spriteConfig={getSpriteConfig(item.key ?? item.label)} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
      </Section>
    {/if}

    <!-- Fluid Flow Charts -->
    {#if fluidDeficits.length > 0 || fluidSurpluses.length > 0}
      <Section title="Fluid Flow">
        {#if fluidDeficits.length > 0}
          <Panel nested>
            <span class="sub-label">Deficits (units/min short)</span>
            <BarChart items={fluidDeficits}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} spriteConfig={getSpriteConfig(item.key ?? item.label)} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
        {#if fluidSurpluses.length > 0}
          <Panel nested>
            <span class="sub-label">Surpluses (units/min excess)</span>
            <BarChart items={fluidSurpluses}>
              {#snippet icon(item)}
                <FactorioIcon name={item.key ?? item.label} size={18} spriteConfig={getSpriteConfig(item.key ?? item.label)} />
              {/snippet}
            </BarChart>
          </Panel>
        {/if}
      </Section>
    {/if}

    <!-- Surplus Connections -->
    {#if data.surplus_connections && data.surplus_connections.length > 0}
      <Section title="Surplus → Deficit Links" count={data.surplus_connections.length} accent="var(--color-positive)">
        <div class="connections-grid">
          {#each data.surplus_connections.slice(0, 8) as conn}
            <div class="connection">
              <span class="conn-surplus">
                <FactorioIcon name={conn.surplus} size={16} spriteConfig={getSpriteConfig(conn.surplus)} />
                {formatName(conn.surplus)}
                <Badge label="+{conn.surplus_rate}/min" variant="positive" />
              </span>
              <span class="conn-arrow">→</span>
              <span class="conn-deficit">
                <FactorioIcon name={conn.deficit} size={16} spriteConfig={getSpriteConfig(conn.deficit)} />
                {formatName(conn.deficit)}
              </span>
            </div>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Tech Recommendations -->
    {#if data.tech_recommendations.length > 0}
      <Section title="Research Recommendations" count={data.tech_recommendations.length} accent="var(--color-info)">
        {#each data.tech_recommendations as rec}
          <Panel nested compact>
            <div class="tech-header">
              <span class="tech-name">{formatName(rec.tech)}</span>
              {#if rec.inputs_available}
                <Badge label="Ready to Use" variant="positive" />
              {:else}
                <Badge label="Missing Inputs" variant="warning" />
              {/if}
            </div>
            <div class="tech-details">
              <span class="tech-label">Unlocks:</span>
              {#each rec.recipes_unlocked as recipe}
                <span class="tech-recipe">{formatName(recipe)}</span>
              {/each}
            </div>
            <div class="tech-details">
              <span class="tech-label">Helps:</span>
              {#each rec.deficit_items as item}
                <span class="tech-deficit">
                  <FactorioIcon name={item} size={14} spriteConfig={getSpriteConfig(item)} />
                  {formatName(item)}
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

  .summary-row {
    display: flex;
    gap: var(--space-xl);
    justify-content: center;
    padding: var(--space-sm) 0;
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

  .alert-badges {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
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

  .alert-rate-moderate {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-info);
    white-space: nowrap;
  }

  .alert-meta {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    padding-left: calc(24px + var(--space-sm));
    margin-top: 2px;
  }

  .root-chain {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding-left: calc(24px + var(--space-sm));
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .chain-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .chain-root {
    color: var(--color-negative);
    font-weight: 600;
  }

  .chain-arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .consumers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding-left: calc(24px + var(--space-sm));
    margin-top: 4px;
  }

  .consumer {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-border) 10%, transparent);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
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

  .connections-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .connection {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .conn-surplus,
  .conn-deficit {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .conn-surplus {
    color: var(--color-positive);
  }

  .conn-deficit {
    color: var(--color-text);
  }

  .conn-arrow {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .tech-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .tech-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  .tech-details {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
    padding-left: var(--space-xs);
    margin-top: 2px;
  }

  .tech-label {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tech-recipe {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 10%, transparent);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .tech-deficit {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text);
  }
</style>
