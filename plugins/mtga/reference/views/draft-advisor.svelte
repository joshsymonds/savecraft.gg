<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import FilterBar from "../../../../views/src/components/data/FilterBar.svelte";
  import HoverTip from "../../../../views/src/components/data/HoverTip.svelte";
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

  function gradeDescription(score: number): string {
    const pct = Math.round(score * 100);
    if (score >= 0.8) return `Score: ${pct}% — Top-tier pick, take it every time`;
    if (score >= 0.65) return `Score: ${pct}% — Strong pick for your deck`;
    if (score >= 0.5) return `Score: ${pct}% — Solid, fills a need`;
    if (score >= 0.35) return `Score: ${pct}% — Acceptable if nothing better`;
    if (score >= 0.2) return `Score: ${pct}% — Weak, only if desperate`;
    return `Score: ${pct}% — Not worth picking`;
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
</script>

{#if isBatchMode}
  <!-- ── Batch review mode ── -->
  {@const summary = data.summary!}
  {@const picks = data.picks!}

  <div class="draft-advisor">
    <Panel watermark={data.icon_url}>
      <Section title="Draft Review">
        <!-- Summary scorecard -->
        <div class="scorecard">
          <div class="score-block" style:--score-color="var(--color-positive)">
            <span class="score-value">{summary.optimal}</span>
            <span class="score-label">Optimal</span>
          </div>
          <div class="score-block" style:--score-color="var(--color-info)">
            <span class="score-value">{summary.good}</span>
            <span class="score-label">Good</span>
          </div>
          <div class="score-block" style:--score-color="var(--color-warning)">
            <span class="score-value">{summary.questionable}</span>
            <span class="score-label">Questionable</span>
          </div>
          <div class="score-block" style:--score-color="var(--color-negative)">
            <span class="score-value">{summary.misses}</span>
            <span class="score-label">Misses</span>
          </div>
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

        <div class="pick-list">
          {#each data.recommendations ?? [] as rec (rec.card)}
            {@const reasons = topReasons(rec.axes)}
            <div class="pick-row" class:top-pick={rec.rank === 1}>
              <span class="rank">#{rec.rank}</span>
              <div class="pick-info">
                <span class="pick-name">{rec.card}</span>
                {#if reasons.length > 0}
                  <span class="pick-reasons">{reasons.join(" · ")}</span>
                {/if}
              </div>
              <HoverTip text={gradeDescription(rec.composite_score)}>
                <Badge label={gradeLabel(rec.composite_score)} variant={gradeVariant(rec.composite_score)} />
              </HoverTip>
            </div>
          {/each}
        </div>
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

  /* ── Scorecard ── */
  .scorecard {
    display: flex;
    gap: var(--space-sm);
  }

  .score-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-sm) var(--space-xs);
    background: color-mix(in srgb, var(--score-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--score-color) 30%, transparent);
    border-radius: var(--radius-md);
  }

  .score-value {
    font-family: var(--font-heading);
    font-size: 24px;
    font-weight: 700;
    color: var(--score-color);
  }

  .score-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--score-color);
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.8;
  }

  /* ── Warnings ── */
  .warnings {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* ── Pick list (shared between modes) ── */
  .pick-list {
    display: flex;
    flex-direction: column;
  }

  .pick-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .pick-row:last-child {
    border-bottom: none;
  }

  .pick-row.top-pick {
    background: color-mix(in srgb, var(--color-gold) 6%, transparent);
  }

  .pick-row:hover {
    background: color-mix(in srgb, var(--color-border) 10%, transparent);
  }

  .rank {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    min-width: 36px;
    flex-shrink: 0;
  }

  .pick-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  .pick-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }

  .pick-reasons {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .top-pick .rank {
    color: var(--color-gold-light);
  }

  .top-pick .pick-name {
    color: var(--color-gold-light);
  }
</style>
