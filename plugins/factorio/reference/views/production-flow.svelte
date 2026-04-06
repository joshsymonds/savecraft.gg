<!--
  @component
  Factorio factory diagnosis view — bottleneck-first design.
  Each bottleneck shows production → gauge → consumption as a visual flow,
  making the supply/demand gap immediately obvious. Groups deficits by
  root cause into bottleneck trees with downstream cascades.

  @attribution wube
-->
<script lang="ts">
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import FactorioIcon from "../../../../views/src/components/factorio/FactorioIcon.svelte";
  import type { SpriteConfig } from "../../../../views/src/components/factorio/factorio-icons";

  import itemManifest from "../../sprites/items.json";
  import fluidManifest from "../../sprites/fluids.json";

  interface Consumer { recipe: string; item: string; rate: number; percent: number; is_recycling: boolean; }
  interface MachineGap { machine_type: string; current_count: number; effective_rate: number; additional_needed: number; recipe: string; }
  interface AffectedItem { item: string; net_rate: number; severity: string; }
  interface FixableFrom { item: string; surplus_rate: number; }
  interface InlineTech { tech: string; recipes_unlocked: string[]; inputs_available: boolean; }

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

  interface TechRecommendation { tech: string; recipes_unlocked: string[]; deficit_items: string[]; inputs_available: boolean; }

  interface Props {
    data: {
      summary: { bottleneck_count: number; independent_count: number; active_count: number; critical_count: number; };
      bottlenecks: Bottleneck[];
      independent: IndependentProblem[];
      tech_recommendations: TechRecommendation[];
      icon_url?: string;
    };
    spriteBaseUrl?: string;
  }

  let { data, spriteBaseUrl = "/plugins/factorio/sprites" }: Props = $props();

  let itemSpriteConfig: SpriteConfig = $derived({ url: `${spriteBaseUrl}/items.png`, sheetWidth: 2048, sheetHeight: 704, manifest: itemManifest });
  let fluidSpriteConfig: SpriteConfig = $derived({ url: `${spriteBaseUrl}/fluids.png`, sheetWidth: 2048, sheetHeight: 128, manifest: fluidManifest });
  function getSpriteConfig(iconName: string): SpriteConfig {
    if (fluidManifest[iconName as keyof typeof fluidManifest]) return fluidSpriteConfig;
    return itemSpriteConfig;
  }

  function formatName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatRate(rate: number): string {
    return rate.toLocaleString();
  }

  function supplyPercent(produced: number, consumed: number): number {
    if (consumed <= 0) return 100;
    return Math.min(Math.round((produced / consumed) * 100), 100);
  }

  function supplyVariant(pct: number): "negative" | "info" | "positive" {
    if (pct < 25) return "negative";
    if (pct < 75) return "info";
    return "positive";
  }

  function bottleneckLabel(type: string): string {
    switch (type) {
      case "not_built": return "No production line";
      case "input_starvation": return "Input starved";
      case "throughput": return "Need more machines";
      default: return type;
    }
  }

  function bottleneckVariant(type: string): "negative" | "warning" | "info" {
    switch (type) {
      case "not_built": return "negative";
      case "input_starvation": return "warning";
      default: return "info";
    }
  }

  function buildDetailKV(bn: Bottleneck): { key: string; value: string | number; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }[] {
    const items: { key: string; value: string | number; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }[] = [];
    if (bn.affected.length > 0) {
      items.push({ key: "Downstream affected", value: `${bn.affected.length} items`, variant: "warning" });
    }
    if (bn.machine_gap) {
      items.push({ key: "Machines needed", value: `+${bn.machine_gap.additional_needed} ${formatName(bn.machine_gap.machine_type)}`, variant: "info" });
    }
    if (bn.fixable_from.length > 0) {
      const f = bn.fixable_from[0];
      items.push({ key: "Available surplus", value: `${formatName(f.item)} (+${formatRate(f.surplus_rate)}/min)`, variant: "positive" });
    }
    return items;
  }
</script>

<Panel watermark={data.icon_url}>
  <div class="flow-layout">
    <Section
      title="Factory Diagnosis"
      accent={data.summary.bottleneck_count > 0 ? data.summary.critical_count > 0 ? "var(--color-negative)" : "var(--color-warning)" : "var(--color-positive)"}
    >
      <div class="hero-row">
        <Stat value={data.summary.bottleneck_count} label="Bottlenecks" variant={data.summary.bottleneck_count > 0 ? "negative" : "positive"} />
        <Stat value={data.summary.active_count} label="Active Items" variant="muted" />
        <Stat value={data.summary.critical_count} label="Critical" variant={data.summary.critical_count > 0 ? "negative" : "muted"} />
      </div>
    </Section>

    {#if data.bottlenecks.length > 0}
      <Section title="Bottlenecks" count={data.bottlenecks.length} accent="var(--color-negative)">
        <div class="card-list">
          {#each data.bottlenecks as bn}
            <Panel nested>
              <!-- Title row: icon + name + type badge -->
              <div class="card-title">
                <FactorioIcon name={bn.root_item} size={24} spriteConfig={getSpriteConfig(bn.root_item)} />
                <span class="item-name">{formatName(bn.root_item)}</span>
                <Badge label={bottleneckLabel(bn.bottleneck_type)} variant={bottleneckVariant(bn.bottleneck_type)} />
              </div>

              <!-- Supply gauge: Produced → Ring → Consumed -->
              <div class="supply-gauge">
                <div class="gauge-end produced">
                  <span class="gauge-value">{formatRate(bn.produced_per_min)}</span>
                  <span class="gauge-label">produced/min</span>
                </div>
                <div class="gauge-center">
                  <span class="gauge-arrow">→</span>
                  <ProgressRing
                    value={supplyPercent(bn.produced_per_min, bn.consumed_per_min)}
                    label="{supplyPercent(bn.produced_per_min, bn.consumed_per_min)}%"
                    variant={supplyVariant(supplyPercent(bn.produced_per_min, bn.consumed_per_min))}
                    size={56}
                  />
                  <span class="gauge-arrow">→</span>
                </div>
                <div class="gauge-end consumed">
                  <span class="gauge-value">{formatRate(bn.consumed_per_min)}</span>
                  <span class="gauge-label">consumed/min</span>
                </div>
              </div>

              <!-- Detail KV grid -->
              {#if buildDetailKV(bn).length > 0}
                <KeyValue items={buildDetailKV(bn)} />
              {/if}

              <!-- Affected downstream as chips -->
              {#if bn.affected.length > 0}
                <div class="chip-section">
                  <span class="chip-label">Also blocking</span>
                  <div class="chip-row">
                    {#each bn.affected.slice(0, 6) as a}
                      <span class="chip" class:chip-critical={a.severity === "critical"}>
                        <FactorioIcon name={a.item} size={14} spriteConfig={getSpriteConfig(a.item)} />
                        {formatName(a.item)}
                      </span>
                    {/each}
                    {#if bn.affected.length > 6}
                      <span class="chip-overflow">+{bn.affected.length - 6}</span>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Tech recommendations inline -->
              {#if bn.tech.length > 0}
                {#each bn.tech as t}
                  <div class="tech-line">
                    Research <strong>{formatName(t.tech)}</strong>
                    {#if t.inputs_available}
                      <Badge label="Ready" variant="positive" />
                    {:else}
                      <Badge label="Missing Inputs" variant="warning" />
                    {/if}
                  </div>
                {/each}
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    {#if data.independent.length > 0}
      <Section title="Independent Problems" count={data.independent.length} accent="var(--color-warning)">
        <div class="card-list">
          {#each data.independent as prob}
            <Panel nested compact>
              <!-- Title row -->
              <div class="card-title">
                <FactorioIcon name={prob.item} size={22} spriteConfig={getSpriteConfig(prob.item)} />
                <span class="item-name">{formatName(prob.item)}</span>
                <Badge label={bottleneckLabel(prob.bottleneck_type)} variant={bottleneckVariant(prob.bottleneck_type)} />
              </div>

              <!-- Compact supply gauge -->
              <div class="supply-gauge compact">
                <div class="gauge-end produced">
                  <span class="gauge-value sm">{formatRate(prob.produced_per_min)}</span>
                  <span class="gauge-label">produced</span>
                </div>
                <div class="gauge-center">
                  <span class="gauge-arrow">→</span>
                  <ProgressRing
                    value={supplyPercent(prob.produced_per_min, prob.consumed_per_min)}
                    label="{supplyPercent(prob.produced_per_min, prob.consumed_per_min)}%"
                    variant={supplyVariant(supplyPercent(prob.produced_per_min, prob.consumed_per_min))}
                    size={44}
                  />
                  <span class="gauge-arrow">→</span>
                </div>
                <div class="gauge-end consumed">
                  <span class="gauge-value sm">{formatRate(prob.consumed_per_min)}</span>
                  <span class="gauge-label">consumed</span>
                </div>
              </div>

              {#if prob.machine_gap}
                <div class="tech-line">
                  Build <strong>+{prob.machine_gap.additional_needed} {formatName(prob.machine_gap.machine_type)}</strong>
                  <span class="muted">(have {prob.machine_gap.current_count})</span>
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      </Section>
    {/if}

    {#if data.tech_recommendations.length > 0}
      <Section title="Research Recommendations" count={data.tech_recommendations.length} accent="var(--color-info)">
        {#each data.tech_recommendations as rec}
          <Panel nested compact>
            <div class="card-title">
              <span class="item-name">{formatName(rec.tech)}</span>
              {#if rec.inputs_available}
                <Badge label="Ready to Use" variant="positive" />
              {:else}
                <Badge label="Missing Inputs" variant="warning" />
              {/if}
            </div>
            <div class="chip-section" style="margin-top: 4px">
              <span class="chip-label">Helps</span>
              <div class="chip-row">
                {#each rec.deficit_items as item}
                  <span class="chip">
                    <FactorioIcon name={item} size={14} spriteConfig={getSpriteConfig(item)} />
                    {formatName(item)}
                  </span>
                {/each}
              </div>
            </div>
          </Panel>
        {/each}
      </Section>
    {/if}
  </div>
</Panel>

<style>
  .flow-layout { display: flex; flex-direction: column; gap: 24px; }
  .hero-row { display: flex; gap: var(--space-xl); justify-content: center; padding: var(--space-sm) 0; }
  .card-list { display: flex; flex-direction: column; gap: var(--space-sm); }

  /* ── Card title ── */

  .card-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .item-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  /* ── Supply gauge: Produced → Ring → Consumed ── */

  .supply-gauge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-sm);
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-sm);
  }

  .supply-gauge.compact {
    padding: var(--space-sm) var(--space-xs);
    margin-bottom: var(--space-xs);
  }

  .gauge-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 70px;
  }

  .gauge-value {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }

  .gauge-value.sm {
    font-size: 15px;
  }

  .produced .gauge-value {
    color: var(--color-positive);
  }

  .consumed .gauge-value {
    color: var(--color-negative);
  }

  .gauge-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .gauge-center {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .gauge-arrow {
    font-size: 16px;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  /* ── Chip sections (downstream, tech helps) ── */

  .chip-section {
    margin-top: var(--space-xs);
  }

  .chip-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    display: block;
    margin-bottom: 4px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-border) 15%, transparent);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .chip-critical {
    color: var(--color-negative);
    background: color-mix(in srgb, var(--color-negative) 10%, transparent);
    font-weight: 600;
  }

  .chip-overflow {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    padding: 2px 4px;
  }

  /* ── Tech / solution lines ── */

  .tech-line {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  .tech-line strong {
    color: var(--color-text);
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 11px;
  }
</style>
