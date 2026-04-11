<!--
  Card stats view — set overview and card detail modes.
  Auto-detects mode from data shape.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import StatRow from "../../../../views/src/components/data/StatRow.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";

  interface CardStatRow {
    card_name: string;
    gihwr: number;
    iwd: number;
    ata: number;
    games_in_hand: number;
    [key: string]: unknown;
  }

  interface CardDetailEntry {
    card_name: string;
    gihwr: number;
    ohwr: number;
    gdwr: number;
    gnswr: number;
    iwd: number;
    alsa: number;
    ata: number;
    games_in_hand: number;
    games_played: number;
    set_avg_gihwr: number;
    archetypes: { archetype: string; gihwr: number; iwd: number; games_in_hand: number }[];
  }

  let { data }: {
    data: {
      // Set overview
      set_code?: string;
      format?: string;
      total_games?: number;
      card_count?: number;
      avg_gihwr?: number;
      top_gihwr?: CardStatRow[];
      bottom_gihwr?: CardStatRow[];
      top_iwd?: CardStatRow[];
      undervalued?: CardStatRow[];
      // Card detail
      query?: string;
      cards?: CardDetailEntry[];
      more?: number;
      // Shared
      icon_url?: string;
    };
  } = $props();

  let isSetOverview = $derived(!!data.top_gihwr);
  let isCardDetail = $derived(!!data.cards && !data.top_gihwr);

  function wrVariant(wr: number, avg?: number): "positive" | "highlight" | "warning" | "negative" | "muted" {
    const baseline = avg ?? 56;
    if (wr >= baseline + 4) return "positive";
    if (wr >= baseline) return "highlight";
    if (wr >= baseline - 4) return "warning";
    if (wr > 0) return "negative";
    return "muted";
  }

  function cardBarItems(cards: CardStatRow[], avg?: number) {
    return cards.map((c) => ({
      label: c.card_name,
      value: Math.round(c.gihwr * 10) / 10,
      variant: wrVariant(c.gihwr, avg) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
    }));
  }
</script>

<div class="card-stats">
  {#if isSetOverview}
    <!-- Set overview hero -->
    <Panel watermark={data.icon_url}>
      <Section title={data.set_code ?? "Set"} subtitle={data.format}>
        <StatRow>
          <Stat value="{data.avg_gihwr?.toFixed(1)}%" label="Avg Win Rate" variant="highlight" />
          <Stat value={data.card_count ?? 0} label="Cards" variant="info" />
          <Stat value={(data.total_games ?? 0).toLocaleString()} label="Games" variant="muted" />
        </StatRow>
      </Section>
    </Panel>

    <!-- Top performers -->
    {#if data.top_gihwr && data.top_gihwr.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="Best Cards">
          <BarChart items={cardBarItems(data.top_gihwr, data.avg_gihwr)} maxValue={70} />
        </Section>
      </Panel>
    {/if}

    <!-- Worst performers -->
    {#if data.bottom_gihwr && data.bottom_gihwr.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="Worst Cards">
          <BarChart items={cardBarItems(data.bottom_gihwr, data.avg_gihwr)} maxValue={70} />
        </Section>
      </Panel>
    {/if}

    <!-- Undervalued gems -->
    {#if data.undervalued && data.undervalued.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="Hidden Gems" subtitle="Above-average win rate but drafted late">
          <BarChart items={cardBarItems(data.undervalued, data.avg_gihwr)} maxValue={70} />
        </Section>
      </Panel>
    {/if}
  {/if}

  {#if isCardDetail}
    {#each data.cards ?? [] as card}
      <!-- Card hero -->
      <Panel watermark={data.icon_url}>
        <Section title={card.card_name} subtitle="{data.set_code} · {data.format}">
          <StatRow>
            <Stat
              value="{card.gihwr.toFixed(1)}%"
              label="GIH Win Rate"
              variant={wrVariant(card.gihwr, card.set_avg_gihwr)}
            />
            <Stat value="{card.ohwr.toFixed(1)}%" label="Opening Hand" variant={wrVariant(card.ohwr, card.set_avg_gihwr)} />
            <Stat value="{card.iwd > 0 ? '+' : ''}{card.iwd.toFixed(1)}pp" label="Impact" variant={card.iwd > 0 ? "positive" : "negative"} />
            <Stat value={card.ata.toFixed(1)} label="Avg Taken At" variant="muted" />
          </StatRow>
        </Section>
      </Panel>

      <!-- Archetype breakdown -->
      {#if card.archetypes.length > 0}
        <Panel watermark={data.icon_url}>
          <Section title="By Archetype">
            <BarChart
              items={card.archetypes.map((a) => ({
                label: a.archetype,
                value: Math.round(a.gihwr * 10) / 10,
                variant: wrVariant(a.gihwr, card.set_avg_gihwr),
              }))}
              maxValue={70}
            />
          </Section>
        </Panel>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .card-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

</style>
