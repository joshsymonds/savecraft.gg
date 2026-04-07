<!--
  @component
  Factorio evolution tracker reference view.
  Shows per-surface evolution progress toward next enemy tier with source breakdown
  and spawn weight distribution.

  @attribution wube
-->
<script lang="ts">
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import StackedBar from "../../../../views/src/components/charts/StackedBar.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface SurfaceData {
    pollutant: string;
    evolution_factor: number;
    sources: {
      time: number;
      pollution: number;
      kills: number;
    };
    dominant_source: "time" | "pollution" | "kills";
    current_tier: string;
    previous_tier_threshold: number;
    next_tier?: {
      name: string;
      threshold: number;
    } | null;
    spawn_weights: Record<string, number>;
    current_pollution: number;
  }

  interface Props {
    data: {
      surfaces: Record<string, SurfaceData>;
      defenses: {
        turrets: Record<string, number>;
        walls: number;
        enemy_bases_nearby: Array<{ distance: number; direction: string; type: string }>;
      };
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  let surfaceEntries = $derived(Object.entries(data.surfaces));

  function evoPercent(factor: number): number {
    return Math.round(factor * 1000) / 10;
  }

  function threatVariant(factor: number): "positive" | "info" | "negative" {
    return factor >= 0.9 ? "negative" : factor >= 0.5 ? "info" : "positive";
  }

  function tierProgress(surface: SurfaceData): number {
    if (!surface.next_tier) return 100;
    const range = surface.next_tier.threshold - surface.previous_tier_threshold;
    if (range <= 0) return 100;
    return Math.round(((surface.evolution_factor - surface.previous_tier_threshold) / range) * 100);
  }

  function formatTierName(name: string): string {
    const labels: Record<string, string> = {
      "none": "None",
      "medium-worm-turret": "Medium",
      "big-worm-turret": "Big",
      "behemoth-worm-turret": "Behemoth",
    };
    return labels[name] ?? name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatSourceName(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function formatSurfaceName(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function sourceSegments(surface: SurfaceData) {
    return [
      { label: "Time", value: Math.round(surface.sources.time * 10000) / 100, color: "var(--color-info)" },
      { label: formatSourceName(surface.pollutant), value: Math.round(surface.sources.pollution * 10000) / 100, color: "var(--color-warning)" },
      { label: "Kills", value: Math.round(surface.sources.kills * 10000) / 100, color: "var(--color-negative)" },
    ];
  }

  function tierKV(surface: SurfaceData) {
    const items: Array<{ key: string; value: string; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }> = [
      { key: "Current tier", value: formatTierName(surface.current_tier) },
    ];
    if (surface.next_tier) {
      items.push({ key: "Next tier", value: `${formatTierName(surface.next_tier.name)} at ${(surface.next_tier.threshold * 100).toFixed(0)}%` });
    } else {
      items.push({ key: "Next tier", value: "All tiers unlocked", variant: "negative" });
    }
    items.push({
      key: "Dominant source",
      value: formatSourceName(surface.dominant_source),
      variant: surface.dominant_source === "time" ? "info" : surface.dominant_source === "pollution" ? "warning" : "negative",
    });
    return items;
  }

  function spawnEntries(surface: SurfaceData) {
    return Object.entries(surface.spawn_weights ?? {})
      .filter(([, w]) => w > 0)
      .sort(([, a], [, b]) => b - a);
  }

  function spawnSegments(surface: SurfaceData) {
    return spawnEntries(surface).map(([name, weight]) => ({
      label: name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      value: Math.round(weight * 1000) / 10,
      color: spawnColor(name),
    }));
  }

  function spawnColor(name: string): string {
    if (name.includes("behemoth") || name.includes("big")) return "var(--color-negative)";
    if (name.includes("medium")) return "var(--color-warning)";
    return "var(--color-positive)";
  }

  let totalTurrets = $derived(Object.values(data.defenses.turrets).reduce((sum, n) => sum + n, 0));
</script>

<Panel watermark={data.icon_url}>
  <div class="evo-layout">
    {#each surfaceEntries as [surfaceName, surface]}
      <Section title="{formatSurfaceName(surfaceName)} — Evolution" accent="var(--color-negative)">
        <div class="hero-row">
          <ProgressRing
            value={tierProgress(surface)}
            label={`${evoPercent(surface.evolution_factor)}%`}
            variant={threatVariant(surface.evolution_factor)}
            size={100}
          />
          <div class="hero-stats">
            <Stat value={`${evoPercent(surface.evolution_factor)}%`} label="Evolution Factor" variant={threatVariant(surface.evolution_factor)} />
          </div>
        </div>
      </Section>

      <Section title="{formatSurfaceName(surfaceName)} — Sources">
        <Panel nested>
          <span class="sub-label">Source Breakdown</span>
          <StackedBar segments={sourceSegments(surface)} />
        </Panel>

        <Panel nested>
          <span class="sub-label">Tier Status</span>
          <KeyValue items={tierKV(surface)} />
        </Panel>
      </Section>

      {#if spawnEntries(surface).length > 0}
        <Section title="{formatSurfaceName(surfaceName)} — Spawn Distribution">
          <Panel nested>
            <span class="sub-label">Current Spawn Weights</span>
            <StackedBar segments={spawnSegments(surface)} />
          </Panel>
        </Section>
      {/if}
    {/each}

    <Section title="Defenses">
      <Panel nested>
        <KeyValue items={[
          { key: "Total turrets", value: String(totalTurrets) },
          ...Object.entries(data.defenses.turrets).map(([name, count]) => ({
            key: name.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            value: String(count),
            variant: "muted" as const,
          })),
          { key: "Walls", value: String(data.defenses.walls) },
          { key: "Nearby enemy bases", value: String(data.defenses.enemy_bases_nearby.length) },
        ]} />
      </Panel>
    </Section>
  </div>
</Panel>

<style>
  .evo-layout {
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
  }
</style>
