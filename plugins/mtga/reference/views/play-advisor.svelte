<!--
  Play advisor view — game review, mulligan, card timing, mana efficiency, attack analysis.
  Auto-detects mode from data shape.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Timeline from "../../../../views/src/components/charts/Timeline.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";

  interface Finding {
    turn: number;
    category: string;
    description: string;
    impact: number;
  }

  interface CardTiming {
    card_name: string;
    best_turn: number;
    best_win_rate: number;
    turns: { turn: number; times_deployed: number; win_rate: number; total_games: number }[];
  }

  let { data }: {
    data: {
      // Game review
      findings?: Finding[];
      total_findings?: number;
      // Mulligan
      hand_size?: number;
      land_count?: number;
      cmc_bucket?: string;
      on_play?: boolean;
      keep_win_rate?: number | null;
      keep_games?: number | null;
      mulligan_win_rate?: number | null;
      mulligan_games?: number | null;
      recommendation?: string | null;
      margin_pp?: number | null;
      // Card timing
      cards?: CardTiming[];
      // Shared
      coverage?: { found: number; total: number };
      disclaimer?: string;
      icon_url?: string;
    };
  } = $props();

  let isGameReview = $derived(!!data.findings);
  let isMulligan = $derived(data.recommendation !== undefined && !data.findings);
  let isCardTiming = $derived(!!data.cards);

  function impactVariant(impact: number): "negative" | "warning" | "info" | "muted" {
    if (impact >= 4) return "negative";
    if (impact >= 2) return "warning";
    return "info";
  }

  function impactLabel(impact: number): string {
    if (impact >= 4) return "major";
    if (impact >= 2) return "moderate";
    return "minor";
  }

  let findingEvents = $derived(
    (data.findings ?? []).map((f) => ({
      label: f.description,
      sublabel: f.category,
      value: `Turn ${f.turn}`,
      variant: impactVariant(f.impact) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
      marker: String(f.turn),
      tag: impactLabel(f.impact),
      tagVariant: impactVariant(f.impact) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
    })),
  );
</script>

<div class="play-advisor">
  {#if data.disclaimer}
    <div class="disclaimer">
      <Badge label="statistical estimates" variant="warning" />
      <span class="disclaimer-text">{data.disclaimer}</span>
    </div>
  {/if}

  {#if isGameReview}
    <Panel watermark={data.icon_url}>
      <Section title="Game Review" subtitle="{data.total_findings ?? 0} findings">
        <Timeline events={findingEvents} />
      </Section>
    </Panel>
  {/if}

  {#if isMulligan}
    <Panel watermark={data.icon_url}>
      <Section title="Mulligan Decision">
        <div class="mulligan">
          <div class="hero-stats">
            <Stat
              value={data.recommendation ?? "—"}
              label="Recommendation"
              variant={data.recommendation === "keep" ? "positive" : data.recommendation === "mulligan" ? "warning" : "muted"}
            />
            {#if data.keep_win_rate != null}
              <Stat value="{data.keep_win_rate.toFixed(1)}%" label="Keep WR" variant="positive" />
            {/if}
            {#if data.mulligan_win_rate != null}
              <Stat value="{data.mulligan_win_rate.toFixed(1)}%" label="Mull WR" variant="warning" />
            {/if}
            {#if data.margin_pp != null}
              <Stat value="{data.margin_pp > 0 ? '+' : ''}{data.margin_pp.toFixed(1)}pp" label="Margin" variant={data.margin_pp > 0 ? "positive" : "negative"} />
            {/if}
          </div>
          <div class="mulligan-context">
            <Badge label="{data.hand_size} cards" variant="info" />
            <Badge label="{data.land_count} lands" variant="info" />
            <Badge label="CMC {data.cmc_bucket}" variant="muted" />
            <Badge label={data.on_play ? "on play" : "on draw"} variant="muted" />
          </div>
        </div>
      </Section>
    </Panel>
  {/if}

  {#if isCardTiming}
    <Panel watermark={data.icon_url}>
      <Section title="Card Timing">
        {#each data.cards ?? [] as card}
          <div class="card-timing">
            <div class="timing-header">
              <span class="timing-name">{card.card_name}</span>
              <Badge label="Best: T{card.best_turn} ({card.best_win_rate.toFixed(1)}%)" variant="positive" />
            </div>
            <BarChart
              items={card.turns.map((t) => ({
                label: `Turn ${t.turn}`,
                value: Math.round(t.win_rate * 10) / 10,
                variant: t.turn === card.best_turn ? "positive" : "info",
              }))}
              maxValue={80}
            />
          </div>
        {/each}
      </Section>
    </Panel>
  {/if}
</div>

<style>
  .play-advisor {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
  }

  .disclaimer-text {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .hero-stats {
    display: flex;
    justify-content: space-around;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
  }

  .mulligan {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .mulligan-context {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    justify-content: center;
  }

  .card-timing {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .card-timing:last-child {
    border-bottom: none;
  }

  .timing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .timing-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }
</style>
