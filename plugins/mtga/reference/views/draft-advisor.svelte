<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import HoverTip from "../../../../views/src/components/data/HoverTip.svelte";
  import ArchetypeLabel from "../../../../views/src/components/mtg/ArchetypeLabel.svelte";

  interface Recommendation {
    card: string;
    composite_score: number;
    rank: number;
    axes: Record<string, { normalized: number; contribution: number; [key: string]: unknown }>;
    waspas: { wsm: number; wpm: number; lambda: number };
  }

  interface ArchetypeCandidate {
    archetype: string;
    weight: number;
    viability: string;
  }

  let { data }: {
    data: {
      archetype: {
        primary: string;
        candidates: ArchetypeCandidate[];
        confidence: number;
      };
      pick_number: number;
      recommendations: Recommendation[];
    };
  } = $props();

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

  /** Top 2 contributing axes, described using the actual axis data */
  function topReasons(axes: Record<string, { normalized: number; contribution: number; [key: string]: unknown }>): string[] {
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
      castability: () => null, // "easy to cast" is boring, skip it
      signal: (a) => {
        const ata = a.ata as number | undefined;
        const pick = a.current_pick as number | undefined;
        if (ata && pick && ata > pick + 2) return "wheeling late (open signal)";
        return null;
      },
      color_commitment: () => null, // "on-color" is obvious, skip it
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

  function archetypeColors(code: string): string[] {
    if (code === "_overall") return [];
    return code.split("");
  }

  let subtitle = $derived.by(() => {
    const primary = data.archetype.primary;
    if (primary === "_overall") return `Pick ${data.pick_number} — exploring colors`;
    return `Pick ${data.pick_number}`;
  });
</script>

<div class="draft-advisor">
  <Panel>
    <Section title="Draft Picks" subtitle={subtitle}>
      {#snippet icons()}
        <ArchetypeLabel colors={archetypeColors(data.archetype.primary)} />
      {/snippet}

      <div class="pick-list">
        {#each data.recommendations as rec (rec.card)}
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

<style>
  .draft-advisor {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

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
    min-width: 28px;
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
