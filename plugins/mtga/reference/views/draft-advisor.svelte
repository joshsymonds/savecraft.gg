<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import RankedList from "../../../../views/src/components/data/RankedList.svelte";
  import FilterBar from "../../../../views/src/components/data/FilterBar.svelte";
  import Timeline from "../../../../views/src/components/charts/Timeline.svelte";
  import ArchetypeLabel from "../../../../views/src/components/mtg/ArchetypeLabel.svelte";
  import { archetypeColors } from "../../../../views/src/components/mtg/colors";

  // ── Single pick types ──
  interface AxisScore {
    raw: number;
    normalized: number;
    weight: number;
    contribution: number;
    [key: string]: unknown;
  }

  interface Recommendation {
    card: string;
    composite_score: number;
    rank: number;
    axes: Record<string, AxisScore>;
    waspas: { wsm: number; wpm: number; lambda: number };
  }

  interface ArchetypeCandidate {
    archetype: string;
    weight: number;
    viability: string;
  }

  // ── Batch review types ──
  interface Pick {
    pick_number: number;
    pack_number: number;
    pick_in_pack: number;
    display_label: string;
    chosen: string;
    chosen_rank: number;
    chosen_composite: number;
    recommended: string;
    recommended_composite: number;
    classification: "optimal" | "good" | "questionable" | "miss";
    archetype_snapshot: { primary: string; confidence: number; viability: string; phase: string };
  }

  interface Summary {
    total_picks: number;
    optimal: number;
    good: number;
    questionable: number;
    misses: number;
    score: string;
    archetype_warnings: string[];
  }

  let { data }: {
    data: {
      // Single pick mode
      archetype?: { primary: string; candidates: ArchetypeCandidate[]; confidence: number };
      pick_number?: number;
      recommendations?: Recommendation[];
      // Batch review mode
      summary?: Summary;
      picks?: Pick[];
      // Shared
      icon_url?: string;
    };
  } = $props();

  let isBatchMode = $derived(!!data.summary && !!data.picks);

  // ── Single pick helpers ──
  function gradeLabel(score: number): string {
    if (score >= 0.8) return "bomb";
    if (score >= 0.65) return "great";
    if (score >= 0.5) return "good";
    if (score >= 0.35) return "playable";
    if (score >= 0.2) return "filler";
    return "skip";
  }

  function gradeVariant(score: number): string {
    if (score >= 0.8) return "legendary";
    if (score >= 0.65) return "positive";
    if (score >= 0.5) return "info";
    if (score >= 0.35) return "warning";
    return "muted";
  }

  function topReasons(axes: Record<string, AxisScore>): string[] {
    const describers: Record<string, (a: Record<string, unknown>) => string | null> = {
      baseline: (a) => {
        const wr = a.gihwr as number | undefined;
        return wr ? `${wr.toFixed(1)}% win rate` : "strong win rate";
      },
      synergy: (a) => {
        const syns = a.top_synergies as { card: string }[] | undefined;
        if (syns?.length) return `synergy with ${syns[0].card}`;
        return "pool synergy";
      },
      role: (a) => {
        const detail = a.detail as string | undefined;
        return detail && detail !== "no role data" ? detail : null;
      },
      curve: (a) => {
        const cmc = a.cmc as number | undefined;
        return cmc !== undefined ? `fills ${cmc}-drop slot` : null;
      },
      castability: () => null,
      signal: (a) => {
        const ata = a.ata as number | undefined;
        const pick = a.current_pick as number | undefined;
        if (ata && pick && ata > pick + 2) return "wheeling late (open signal)";
        return null;
      },
      color_commitment: () => null,
      opportunity_cost: () => null,
    };

    return Object.entries(axes)
      .filter(([, a]) => a.contribution > 0.05)
      .sort(([, a], [, b]) => b.contribution - a.contribution)
      .slice(0, 2)
      .map(([key, a]) => {
        const fn = describers[key];
        return fn ? fn(a as Record<string, unknown>) : null;
      })
      .filter((r): r is string => r !== null);
  }


  // ── Single pick derived ──
  let subtitle = $derived.by(() => {
    if (isBatchMode) return "";
    const primary = data.archetype?.primary ?? "_overall";
    if (primary === "_overall") return `Pick ${data.pick_number} — exploring colors`;
    return `Pick ${data.pick_number}`;
  });

  // ── Batch review helpers ──
  const CLASS_COLORS: Record<string, string> = {
    optimal: "var(--color-positive)",
    good: "var(--color-info)",
    questionable: "var(--color-warning)",
    miss: "var(--color-negative)",
  };

  const CLASS_VARIANT: Record<string, string> = {
    optimal: "positive",
    good: "info",
    questionable: "warning",
    miss: "negative",
  };

  const FILTER_OPTIONS = [
    { label: "Misses", value: "miss", color: "var(--color-negative)" },
    { label: "Questionable", value: "questionable", color: "var(--color-warning)" },
    { label: "Good", value: "good", color: "var(--color-info)" },
    { label: "Optimal", value: "optimal", color: "var(--color-positive)" },
  ];

  let activeFilters = $state(["miss", "questionable"]);

  let filteredPicks = $derived(
    data.picks
      ? activeFilters.length === 0 || activeFilters.length === 4
        ? data.picks
        : data.picks.filter((p) => activeFilters.includes(p.classification))
      : [],
  );

  let timelineEvents = $derived(
    filteredPicks.map((pick) => ({
      label: pick.chosen,
      sublabel: pick.classification !== "optimal" && pick.chosen !== pick.recommended
        ? `→ ${pick.recommended}`
        : undefined,
      value: pick.display_label,
      variant: (CLASS_VARIANT[pick.classification] ?? "muted") as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
      marker: String(pick.pick_in_pack),
      tag: pick.classification,
      tagVariant: (CLASS_VARIANT[pick.classification] ?? "muted") as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
    })),
  );

  let pickItems = $derived(
    (data.recommendations ?? []).map((rec) => {
      const reasons = topReasons(rec.axes);
      return {
        rank: rec.rank,
        label: rec.card,
        sublabel: reasons.length > 0 ? reasons.join(" · ") : undefined,
        value: `${Math.round(rec.composite_score * 100)}%`,
        variant: gradeVariant(rec.composite_score) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
        badge: { label: gradeLabel(rec.composite_score), variant: gradeVariant(rec.composite_score) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted" },
      };
    }),
  );
</script>

{#if isBatchMode}
  <!-- ── Batch review mode ── -->
  {@const summary = data.summary!}
  {@const picks = data.picks!}

  <div class="draft-advisor">
    <Panel watermark={data.icon_url}>
      <Section title="Draft Review">
        <div class="hero-stats">
          <Stat value={summary.optimal} label="Optimal" variant="positive" />
          <Stat value={summary.good} label="Good" variant="info" />
          <Stat value={summary.questionable} label="Questionable" variant="warning" />
          <Stat value={summary.misses} label="Misses" variant="negative" />
        </div>

        <!-- Archetype warnings -->
        {#if summary.archetype_warnings.length > 0}
          <div class="warnings">
            {#each summary.archetype_warnings as warning}
              <Badge label={warning} variant="warning" />
            {/each}
          </div>
        {/if}
      </Section>
    </Panel>

    <!-- Pick timeline -->
    <Panel watermark={data.icon_url}>
      <Section title="Pick Timeline">
        <FilterBar
          filters={FILTER_OPTIONS}
          active={activeFilters}
          onchange={(v) => activeFilters = v}
        />
        <Timeline events={timelineEvents} />
      </Section>
    </Panel>
  </div>

{:else}
  <!-- ── Single pick mode ── -->
  <div class="draft-advisor">
    <Panel watermark={data.icon_url}>
      <Section title="Draft Picks" subtitle={subtitle}>
        {#snippet icons()}
          {#if data.archetype}
            <ArchetypeLabel colors={archetypeColors(data.archetype.primary)} />
          {/if}
        {/snippet}

        <RankedList items={pickItems} />
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .draft-advisor {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .hero-stats {
    display: flex;
    justify-content: space-around;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
  }

  /* ── Warnings ── */
  .warnings {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
</style>
