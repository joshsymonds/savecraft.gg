<!--
  Match stats view — overview, by-deck, by-format, and matchup modes.
  Auto-detects mode from data shape.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";

  interface WinLossRow {
    wins: number;
    losses: number;
    total: number;
    win_rate: number;
  }

  let { data }: {
    data: {
      // Overview
      total_matches?: number;
      total_wins?: number;
      total_losses?: number;
      win_rate?: number;
      by_format?: (WinLossRow & { format: string })[];
      // By deck
      decks?: (WinLossRow & { deck: string })[];
      // By format
      formats?: (WinLossRow & { format: string })[];
      // By matchup
      format?: string;
      matchups?: (WinLossRow & { archetype: string })[];
      // Shared
      icon_url?: string;
    };
  } = $props();

  function winRateVariant(wr: number): "positive" | "highlight" | "warning" | "negative" | "muted" {
    if (wr >= 60) return "positive";
    if (wr >= 52) return "highlight";
    if (wr >= 48) return "warning";
    if (wr > 0) return "negative";
    return "muted";
  }

  function toBarItems(rows: { label: string; win_rate: number; total: number }[]) {
    return rows.map((r) => ({
      label: `${r.label} (${r.total})`,
      value: Math.round(r.win_rate * 10) / 10,
      variant: winRateVariant(r.win_rate) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
    }));
  }

  let isOverview = $derived(data.total_matches !== undefined);
  let isDeck = $derived(!!data.decks);
  let isFormat = $derived(!!data.formats);
  let isMatchup = $derived(!!data.matchups);
</script>

<div class="match-stats">
  {#if isOverview}
    <!-- Hero stats -->
    <Panel watermark={data.icon_url}>
      <Section title="Match Record">
        <div class="hero-stats">
          <Stat value="{data.win_rate?.toFixed(1)}%" label="Win Rate" variant={winRateVariant(data.win_rate ?? 0)} />
          <Stat value={data.total_matches ?? 0} label="Matches" variant="info" />
          <Stat value={data.total_wins ?? 0} label="Wins" variant="positive" />
          <Stat value={data.total_losses ?? 0} label="Losses" variant="negative" />
        </div>
      </Section>
    </Panel>

    {#if data.by_format && data.by_format.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="By Format">
          <BarChart
            items={toBarItems(data.by_format.map((f) => ({ label: f.format, win_rate: f.win_rate, total: f.total })))}
            maxValue={100}
          />
        </Section>
      </Panel>
    {/if}
  {/if}

  {#if isDeck}
    <Panel watermark={data.icon_url}>
      <Section title="By Deck">
        <BarChart
          items={toBarItems(data.decks!.map((d) => ({ label: d.deck, win_rate: d.win_rate, total: d.total })))}
          maxValue={100}
        />
      </Section>
    </Panel>
  {/if}

  {#if isFormat}
    <Panel watermark={data.icon_url}>
      <Section title="By Format">
        <BarChart
          items={toBarItems(data.formats!.map((f) => ({ label: f.format, win_rate: f.win_rate, total: f.total })))}
          maxValue={100}
        />
      </Section>
    </Panel>
  {/if}

  {#if isMatchup}
    <Panel watermark={data.icon_url}>
      <Section title="Matchups" subtitle={data.format}>
        <BarChart
          items={toBarItems(data.matchups!.map((m) => ({ label: m.archetype, win_rate: m.win_rate, total: m.total })))}
          maxValue={100}
        />
      </Section>
    </Panel>
  {/if}
</div>

<style>
  .match-stats {
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
</style>
