<!--
  Deckbuilding view — health check diagnostics and cut advisor.
  Auto-detects mode from data.mode field.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
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

  const STATUS_VARIANT: Record<string, string> = {
    good: "positive",
    warning: "warning",
    issue: "negative",
  };

  let isHealthCheck = $derived(data.mode === "health_check");
  let isCutAdvisor = $derived(data.mode === "cut_advisor");
  let isConstructed = $derived(data.mode === "constructed");


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

        <div class="health-list">
          {#each data.sections ?? [] as section}
            <div class="health-row" class:is-issue={section.status === "issue"} class:is-warning={section.status === "warning"}>
              <div class="health-info">
                <div class="health-header">
                  <span class="health-name">{section.name}</span>
                  <Badge label={section.status} variant={STATUS_VARIANT[section.status] ?? "muted"} />
                </div>
                <span class="health-note">{section.note}</span>
              </div>
              <div class="health-values">
                <span class="health-actual">{section.actual}</span>
                <span class="health-expected">/ {section.expected}</span>
              </div>
            </div>
          {/each}
        </div>
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

        <div class="cut-list">
          {#each data.candidates ?? [] as cut, i}
            <div class="cut-row">
              <span class="cut-rank">#{i + 1}</span>
              <div class="cut-info">
                <span class="cut-name">{cut.card}</span>
                <span class="cut-reason">{cut.reason}</span>
              </div>
              <Badge label="cut" variant="negative" />
            </div>
          {/each}
        </div>
      </Section>
    </Panel>
  {/if}

  {#if isConstructed && data.formatted_report}
    <Panel watermark={data.icon_url}>
      <Section title="Deck Analysis">
        <pre class="constructed-report">{data.formatted_report}</pre>
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

  /* ── Health check ── */
  .health-list {
    display: flex;
    flex-direction: column;
  }

  .health-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .health-row:last-child {
    border-bottom: none;
  }

  .health-row.is-issue {
    background: color-mix(in srgb, var(--color-negative) 5%, transparent);
  }

  .health-row.is-warning {
    background: color-mix(in srgb, var(--color-warning) 4%, transparent);
  }

  .health-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .health-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .health-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .health-note {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .health-values {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-shrink: 0;
  }

  .health-actual {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 700;
    color: var(--color-text);
  }

  .health-expected {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  /* ── Cut advisor ── */
  .cut-list {
    display: flex;
    flex-direction: column;
  }

  .cut-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 20%, transparent);
  }

  .cut-row:last-child {
    border-bottom: none;
  }

  .cut-rank {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-negative);
    min-width: 28px;
    flex-shrink: 0;
  }

  .cut-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
  }

  .cut-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .cut-reason {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  /* ── Constructed ── */
  .constructed-report {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
    white-space: pre-wrap;
    line-height: 1.5;
  }
</style>
