<!--
  @component
  Factorio evolution tracker reference view.
  Shows evolution progress toward next enemy tier with source breakdown
  and biter spawn weight distribution.

  @attribution wube
-->
<script lang="ts">
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import StackedBar from "../../../../views/src/components/charts/StackedBar.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Props {
    data: {
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
    };
  }

  let { data }: Props = $props();

  let evoPercent = $derived(Math.round(data.evolution_factor * 1000) / 10);

  let threatVariant = $derived<"positive" | "info" | "negative">(
    data.evolution_factor >= 0.9 ? "negative" : data.evolution_factor >= 0.5 ? "info" : "positive",
  );

  // Progress toward next tier (0-100), or 100 if past all tiers
  let tierProgress = $derived.by(() => {
    if (!data.next_tier) return 100;
    const range = data.next_tier.threshold - data.previous_tier_threshold;
    if (range <= 0) return 100;
    return Math.round(((data.evolution_factor - data.previous_tier_threshold) / range) * 100);
  });

  let tierProgressLabel = $derived(`${evoPercent}%`);

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

  let sourceSegments = $derived([
    { label: "Time", value: Math.round(data.sources.time * 10000) / 100, color: "var(--color-info)" },
    { label: "Pollution", value: Math.round(data.sources.pollution * 10000) / 100, color: "var(--color-warning)" },
    { label: "Kills", value: Math.round(data.sources.kills * 10000) / 100, color: "var(--color-negative)" },
  ]);

  let tierKV = $derived.by(() => {
    const items: Array<{ key: string; value: string; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }> = [
      { key: "Current tier", value: formatTierName(data.current_tier) },
    ];
    if (data.next_tier) {
      items.push({ key: "Next tier", value: `${formatTierName(data.next_tier.name)} at ${(data.next_tier.threshold * 100).toFixed(0)}%` });
    } else {
      items.push({ key: "Next tier", value: "All tiers unlocked", variant: "negative" });
    }
    items.push({
      key: "Dominant source",
      value: formatSourceName(data.dominant_source),
      variant: data.dominant_source === "time" ? "info" : data.dominant_source === "pollution" ? "warning" : "negative",
    });
    return items;
  });

  // Filter to non-zero spawn weights, sorted by weight descending
  let spawnEntries = $derived(
    Object.entries(data.spawn_weights ?? {})
      .filter(([, w]) => w > 0)
      .sort(([, a], [, b]) => b - a),
  );

  let spawnSegments = $derived(
    spawnEntries.map(([name, weight]) => ({
      label: name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      value: Math.round(weight * 1000) / 10,
      color: spawnColor(name),
    })),
  );

  function spawnColor(name: string): string {
    if (name.includes("behemoth")) return "var(--color-negative)";
    if (name.includes("big")) return "var(--color-warning)";
    if (name.includes("medium")) return "var(--color-info)";
    return "var(--color-positive)";
  }
</script>

<Panel>
  <div class="evo-layout">
    <Section title="Evolution Progress" accent="var(--color-negative)">
      <div class="hero-row">
        <ProgressRing
          value={tierProgress}
          label={tierProgressLabel}
          variant={threatVariant}
          size={100}
        />
        <div class="hero-stats">
          <Stat value={`${evoPercent}%`} label="Evolution Factor" variant={threatVariant} />
        </div>
      </div>
    </Section>

    <Section title="Evolution Sources">
      <Panel nested>
        <span class="sub-label">Source Breakdown</span>
        <StackedBar segments={sourceSegments} />
      </Panel>

      <Panel nested>
        <span class="sub-label">Tier Status</span>
        <KeyValue items={tierKV} />
      </Panel>
    </Section>

    {#if spawnEntries.length > 0}
      <Section title="Biter Spawn Distribution">
        <Panel nested>
          <span class="sub-label">Current Spawn Weights</span>
          <StackedBar segments={spawnSegments} />
        </Panel>
      </Section>
    {/if}
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
