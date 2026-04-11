<!--
  Deckbuilding view — health check diagnostics, cut advisor, and constructed analysis.
  Auto-detects mode from data.mode field.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
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

  let { data }: {
    data: {
      mode?: string;
      set?: string;
      archetype?: string;
      // Health check
      sections?: HealthSection[];
      mana?: { lands: number; sources: Record<string, number> };
      // Cut advisor
      cuts_requested?: number;
      candidates?: CutCandidate[];
      // Constructed
      formatted_report?: string;
      // Shared
      alternatives?: unknown[];
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

  let reportParagraphs = $derived(
    (data.formatted_report ?? "").split(/\n\n+/).filter((p) => p.trim()),
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

  {#if isConstructed && reportParagraphs.length > 0}
    <Panel watermark={data.icon_url}>
      <Section title="Deck Analysis">
        <div class="report">
          {#each reportParagraphs as para}
            <p class="report-para">{para}</p>
          {/each}
        </div>
      </Section>
    </Panel>
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

  .report {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .report-para {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin: 0;
    white-space: pre-line;
  }
</style>
