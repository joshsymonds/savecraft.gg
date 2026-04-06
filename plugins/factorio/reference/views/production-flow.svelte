<!--
  @component
  Factorio factory diagnosis view — bottleneck-first design.
  Groups deficits by root cause into bottleneck trees,
  separates independent problems, and folds surplus connections
  and tech recommendations inline.

  @attribution wube
-->
<script lang="ts">
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

  interface AffectedItem {
    item: string;
    net_rate: number;
    severity: string;
  }

  interface FixableFrom {
    item: string;
    surplus_rate: number;
  }

  interface InlineTech {
    tech: string;
    recipes_unlocked: string[];
    inputs_available: boolean;
  }

  interface Bottleneck {
    root_item: string;
    bottleneck_type: "not_built" | "input_starvation" | "throughput";
    severity: string;
    net_rate: number;
    produced_per_min: number;
    consumed_per_min: number;
    machine_gap?: MachineGap;
    consumers?: Consumer[];
    affected: AffectedItem[];
    fixable_from: FixableFrom[];
    tech: InlineTech[];
  }

  interface IndependentProblem {
    item: string;
    severity: string;
    net_rate: number;
    produced_per_min: number;
    consumed_per_min: number;
    bottleneck_type: "not_built" | "input_starvation" | "throughput";
    machine_gap?: MachineGap;
  }

  interface TechRecommendation {
    tech: string;
    recipes_unlocked: string[];
    deficit_items: string[];
    inputs_available: boolean;
  }

  interface Props {
    data: {
      summary: {
        bottleneck_count: number;
        independent_count: number;
        active_count: number;
        critical_count: number;
      };
      bottlenecks: Bottleneck[];
      independent: IndependentProblem[];
      tech_recommendations: TechRecommendation[];
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

  function formatName(name: string): string {
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function formatRate(rate: number): string {
    return rate < 0 ? `${rate.toLocaleString()}/min` : `+${rate.toLocaleString()}/min`;
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

  const MAX_AFFECTED_SHOWN = 4;
  const MAX_CONSUMERS_SHOWN = 3;
</script>

<Panel watermark={data.icon_url}>
  <div class="flow-layout">
    <!-- Hero: Factory Diagnosis -->
    <Section
      title="Factory Diagnosis"
      accent={data.summary.bottleneck_count > 0
        ? data.summary.critical_count > 0
          ? "var(--color-negative)"
          : "var(--color-warning)"
        : "var(--color-positive)"}
    >
      <div class="hero-row">
        <Stat
          value={data.summary.bottleneck_count}
          label="Bottlenecks"
          variant={data.summary.bottleneck_count > 0 ? "negative" : "positive"}
        />
        <Stat value={data.summary.active_count} label="Active Items" variant="muted" />
        <Stat
          value={data.summary.critical_count}
          label="Critical"
          variant={data.summary.critical_count > 0 ? "negative" : "muted"}
        />
      </div>
    </Section>

    <!-- Bottleneck Trees -->
    {#if data.bottlenecks.length > 0}
      <Section title="Bottlenecks" count={data.bottlenecks.length} accent="var(--color-negative)">
        <div class="bottleneck-list">
          {#each data.bottlenecks as bn}
            <Panel nested compact>
              <!-- Header: icon + name + badges + rate -->
              <div class="bn-header">
                <FactorioIcon name={bn.root_item} size={28} spriteConfig={getSpriteConfig(bn.root_item)} />
                <div class="bn-title">
                  <span class="bn-name">{formatName(bn.root_item)}</span>
                  <div class="bn-badges">
                    <Badge label={bottleneckLabel(bn.bottleneck_type)} variant={bottleneckVariant(bn.bottleneck_type)} />
                    {#if bn.affected.length > 0}
                      <Badge label="{bn.affected.length} downstream" variant="muted" />
                    {/if}
                  </div>
                </div>
                <span class="bn-rate" class:severe={bn.severity === "critical" || bn.severity === "severe"}>
                  {formatRate(bn.net_rate)}
                </span>
              </div>

              <!-- Consumers (root item only, top 3) -->
              {#if bn.consumers && bn.consumers.filter((c) => !c.is_recycling).length > 0}
                <div class="bn-detail">
                  <span class="detail-label">Used by:</span>
                  <span class="detail-items">
                    {#each bn.consumers.filter((c) => !c.is_recycling).slice(0, MAX_CONSUMERS_SHOWN) as c, i}
                      {#if i > 0}<span class="detail-sep">,</span>{/if}
                      <span class="detail-item">
                        <FactorioIcon name={c.item} size={14} spriteConfig={getSpriteConfig(c.item)} />
                        {formatName(c.recipe)} ({c.percent}%)
                      </span>
                    {/each}
                  </span>
                </div>
              {/if}

              <!-- Affected downstream items -->
              {#if bn.affected.length > 0}
                <div class="bn-detail">
                  <span class="detail-label">Starves:</span>
                  <span class="detail-items">
                    {#each bn.affected.slice(0, MAX_AFFECTED_SHOWN) as a, i}
                      {#if i > 0}<span class="detail-sep">,</span>{/if}
                      <span class="detail-item" class:detail-critical={a.severity === "critical"}>
                        <FactorioIcon name={a.item} size={14} spriteConfig={getSpriteConfig(a.item)} />
                        {formatName(a.item)}
                      </span>
                    {/each}
                    {#if bn.affected.length > MAX_AFFECTED_SHOWN}
                      <span class="detail-overflow">+{bn.affected.length - MAX_AFFECTED_SHOWN} more</span>
                    {/if}
                  </span>
                </div>
              {/if}

              <!-- Machine gap -->
              {#if bn.machine_gap}
                <div class="bn-detail">
                  <span class="detail-label">Need:</span>
                  <span class="detail-value">
                    +{bn.machine_gap.additional_needed}
                    <FactorioIcon name={bn.machine_gap.machine_type} size={14} spriteConfig={getSpriteConfig(bn.machine_gap.machine_type)} />
                    {formatName(bn.machine_gap.machine_type)}
                    <span class="detail-muted">(have {bn.machine_gap.current_count})</span>
                  </span>
                </div>
              {/if}

              <!-- Fixable from surplus -->
              {#if bn.fixable_from.length > 0}
                <div class="bn-detail">
                  <span class="detail-label">Fix from:</span>
                  <span class="detail-items">
                    {#each bn.fixable_from as f, i}
                      {#if i > 0}<span class="detail-sep">,</span>{/if}
                      <span class="detail-item detail-positive">
                        <FactorioIcon name={f.item} size={14} spriteConfig={getSpriteConfig(f.item)} />
                        {formatName(f.item)}
                        <Badge label="+{f.surplus_rate}/min" variant="positive" />
                      </span>
                    {/each}
                  </span>
                </div>
              {/if}

              <!-- Inline tech recommendations -->
              {#if bn.tech.length > 0}
                {#each bn.tech as t}
                  <div class="bn-detail">
                    <span class="detail-label">Tech:</span>
                    <span class="detail-value">
                      {formatName(t.tech)}
                      {#if t.inputs_available}
                        <Badge label="Ready" variant="positive" />
                      {:else}
                        <Badge label="Missing Inputs" variant="warning" />
                      {/if}
                    </span>
                  </div>
                {/each}
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Independent Problems -->
    {#if data.independent.length > 0}
      <Section title="Independent Problems" count={data.independent.length} accent="var(--color-warning)">
        <div class="bottleneck-list">
          {#each data.independent as prob}
            <Panel nested compact>
              <div class="bn-header">
                <FactorioIcon name={prob.item} size={24} spriteConfig={getSpriteConfig(prob.item)} />
                <div class="bn-title">
                  <span class="bn-name">{formatName(prob.item)}</span>
                  <div class="bn-badges">
                    <Badge label={prob.severity === "critical" ? "Critical" : "Severe"} variant={severityVariant(prob.severity)} />
                    <Badge label={bottleneckLabel(prob.bottleneck_type)} variant={bottleneckVariant(prob.bottleneck_type)} />
                  </div>
                </div>
                <span class="bn-rate" class:severe={prob.severity === "critical" || prob.severity === "severe"}>
                  {formatRate(prob.net_rate)}
                </span>
              </div>

              {#if prob.machine_gap}
                <div class="bn-detail">
                  <span class="detail-label">Need:</span>
                  <span class="detail-value">
                    +{prob.machine_gap.additional_needed}
                    <FactorioIcon name={prob.machine_gap.machine_type} size={14} spriteConfig={getSpriteConfig(prob.machine_gap.machine_type)} />
                    {formatName(prob.machine_gap.machine_type)}
                    <span class="detail-muted">(have {prob.machine_gap.current_count})</span>
                  </span>
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    <!-- Remaining Tech Recommendations (not already shown inline) -->
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
              <span class="detail-label">Unlocks:</span>
              {#each rec.recipes_unlocked as recipe}
                <span class="tech-recipe">{formatName(recipe)}</span>
              {/each}
            </div>
            <div class="tech-details">
              <span class="detail-label">Helps:</span>
              {#each rec.deficit_items as item}
                <span class="detail-item">
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

  .hero-row {
    display: flex;
    gap: var(--space-xl);
    justify-content: center;
    padding: var(--space-sm) 0;
  }

  .bottleneck-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  /* ── Bottleneck / Independent card header ── */

  .bn-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .bn-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .bn-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .bn-badges {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .bn-rate {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-info);
    white-space: nowrap;
  }

  .bn-rate.severe {
    color: var(--color-negative);
  }

  /* ── Detail lines (Used by, Starves, Need, Fix from, Tech) ── */

  .bn-detail {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    padding-left: calc(28px + var(--space-sm));
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .detail-label {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .detail-items {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .detail-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .detail-item.detail-critical {
    color: var(--color-negative);
    font-weight: 600;
  }

  .detail-item.detail-positive {
    color: var(--color-positive);
  }

  .detail-sep {
    color: var(--color-text-muted);
    opacity: 0.4;
    font-size: 11px;
  }

  .detail-overflow {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .detail-value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text);
  }

  .detail-muted {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  /* ── Tech recommendations section ── */

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

  .tech-recipe {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 10%, transparent);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }
</style>
