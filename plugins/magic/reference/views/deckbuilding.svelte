<!--
  Deckbuilding view — health check diagnostics, cut advisor, and constructed analysis.
  Auto-detects mode from data.mode field.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import StatRow from "../../../../views/src/components/data/StatRow.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";
  import Timeline from "../../../../views/src/components/charts/Timeline.svelte";
  import ArchetypeLabel from "../../../../views/src/components/mtg/ArchetypeLabel.svelte";
  import { archetypeColors } from "../../../../views/src/components/mtg/colors";

  interface HealthSection {
    name: string;
    status: "good" | "warning" | "issue";
    actual: string | number;
    expected: string | number;
    note: string;
  }

  interface CutCandidate {
    card: string;
    score: number;
    reason: string;
  }

  interface ManaColorAnalysis {
    color: string;
    color_name: string;
    sources_needed: number;
    sources_actual: number;
    surplus: number;
    status: string;
    most_demanding: string;
    cost_pattern: string;
    is_gold_adjusted: boolean;
  }

  interface ManaSwapSuggestion {
    cut: string;
    add: string;
    reason: string;
  }

  interface ManaAnalysis {
    pip_distribution: Record<string, number>;
    colors: ManaColorAnalysis[];
    swap_suggestions: ManaSwapSuggestion[];
  }

  let { data }: {
    data: {
      mode?: string;
      set?: string;
      archetype?: string;
      // Health check
      sections?: HealthSection[];
      // Cut advisor
      cuts_requested?: number;
      candidates?: CutCandidate[];
      // Constructed
      format?: string | null;
      total_cards?: number;
      composition?: { creatures: number; noncreatures: number; lands: number };
      sideboard_count?: number | null;
      illegal_cards?: { name: string; status: string }[];
      curve?: { cmc: number; count: number }[];
      mana?: ManaAnalysis;
      // Shared
      unresolved_cards?: string[];
      icon_url?: string;
    };
  } = $props();

  const STATUS_VARIANT: Record<string, "positive" | "negative" | "warning" | "muted"> = {
    good: "positive",
    warning: "warning",
    issue: "negative",
  };

  let isHealthCheck = $derived(data.mode === "health_check");
  let isCutAdvisor = $derived(data.mode === "cut_advisor");
  let isConstructed = $derived(data.mode === "constructed");

  // ── Health check ──
  let healthEvents = $derived(
    (data.sections ?? []).map((section) => ({
      label: section.name,
      sublabel: section.note,
      value: `${section.actual} / ${section.expected}`,
      tag: section.status,
      tagVariant: STATUS_VARIANT[section.status] ?? ("muted" as const),
      variant: STATUS_VARIANT[section.status] ?? ("muted" as const),
    })),
  );

  // ── Cut advisor ──
  let cutEvents = $derived(
    (data.candidates ?? []).map((cut, i) => ({
      label: cut.card,
      sublabel: cut.reason,
      marker: String(i + 1),
      tag: "cut",
      tagVariant: "negative" as const,
      variant: "negative" as const,
    })),
  );

  // ── Constructed ──
  let curveItems = $derived(
    (data.curve ?? []).map((c) => ({
      label: c.cmc === 7 ? "7+" : `${c.cmc}`,
      value: c.count,
      variant: "info" as const,
    })),
  );

  let manaSourceItems = $derived(
    (data.mana?.colors ?? []).map((c) => ({
      label: `${c.color_name} (${c.sources_actual}/${c.sources_needed})`,
      value: c.sources_actual,
      variant: (c.surplus >= 0 ? "positive" : "negative") as "positive" | "negative",
    })),
  );

  let swapEvents = $derived(
    (data.mana?.swap_suggestions ?? []).map((s) => ({
      label: `${s.cut} → ${s.add}`,
      sublabel: s.reason,
      tag: "swap",
      tagVariant: "warning" as const,
      variant: "warning" as const,
    })),
  );

  let legalityOk = $derived(!data.illegal_cards || data.illegal_cards.length === 0);

  let constructedSubtitle = $derived(
    [data.format, data.total_cards ? `${data.total_cards} cards` : null].filter(Boolean).join(" · "),
  );
</script>

<div class="deckbuilding">
  {#if isHealthCheck}
    <Panel watermark={data.icon_url}>
      <Section title="Deck Health" subtitle="{data.set} · {data.archetype}">
        {#snippet icons()}
          {#if data.archetype}
            <ArchetypeLabel colors={archetypeColors(data.archetype)} />
          {/if}
        {/snippet}

        <Timeline events={healthEvents} />
      </Section>
    </Panel>
  {/if}

  {#if isCutAdvisor}
    <Panel watermark={data.icon_url}>
      <Section title="Cut Advisor" subtitle="Suggesting {data.cuts_requested} cuts">
        {#snippet icons()}
          {#if data.archetype}
            <ArchetypeLabel colors={archetypeColors(data.archetype)} />
          {/if}
        {/snippet}

        <Timeline events={cutEvents} />
      </Section>
    </Panel>
  {/if}

  {#if isConstructed}
    <Panel watermark={data.icon_url}>
      <Section title="Deck Overview" subtitle={constructedSubtitle}>
        <StatRow>
          {#if data.total_cards != null}
            <Stat value={data.total_cards} label="Total" variant="highlight" />
          {/if}
          {#if data.composition}
            <Stat value={data.composition.creatures} label="Creatures" variant="positive" />
            <Stat value={data.composition.noncreatures} label="Spells" variant="info" />
            <Stat value={data.composition.lands} label="Lands" variant="muted" />
          {/if}
          {#if data.sideboard_count != null}
            <Stat value={data.sideboard_count} label="Sideboard" variant="muted" />
          {/if}
        </StatRow>
        <div class="legality">
          {#if data.format}
            {#if legalityOk}
              <Badge label="All legal in {data.format}" variant="positive" />
            {:else}
              {#each data.illegal_cards ?? [] as card}
                <Badge label="{card.name} — {card.status}" variant="negative" />
              {/each}
            {/if}
          {/if}
          {#if data.unresolved_cards && data.unresolved_cards.length > 0}
            {#each data.unresolved_cards as card}
              <Badge label="{card} — not in database" variant="warning" />
            {/each}
          {/if}
        </div>
      </Section>
    </Panel>

    {#if curveItems.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="Mana Curve">
          <BarChart items={curveItems} />
        </Section>
      </Panel>
    {/if}

    {#if manaSourceItems.length > 0}
      <Panel watermark={data.icon_url}>
        <Section title="Mana Base">
          <BarChart items={manaSourceItems} />
          {#if swapEvents.length > 0}
            <Timeline events={swapEvents} />
          {/if}
        </Section>
      </Panel>
    {/if}
  {/if}
</div>

<style>
  .deckbuilding {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .legality {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    justify-content: center;
  }
</style>
