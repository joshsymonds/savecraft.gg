<!--
  @component
  Factorio tech tree navigator reference view.
  Shows the research path as a styled numbered list, science pack costs
  in a DataTable, and summary stats in KeyValue.

  @attribution wube
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface ResearchStep {
    name: string;
    planet?: string;
  }

  interface Props {
    data: {
      /** Game icon injected by the handler */
      icon_url?: string;
      target: string;
      chain?: string[];
      chain_length?: number;
      total_cost: Record<string, number>;
      total_time_seconds: number;
      research_order?: ResearchStep[];
      remaining?: number;
      already_completed?: number;
    };
  }

  let { data }: Props = $props();

  function formatItemName(name: string): string {
    return name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatTime(seconds: number): string {
    if (seconds <= 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    return `${secs}s`;
  }

  let isComplete = $derived((data.chain_length ?? data.remaining ?? 0) === 0);
  let hasSaveData = $derived(data.remaining != null);

  const planetVariant: Record<string, "warning" | "info" | "positive" | "muted"> = {
    vulcanus: "warning",
    fulgora: "info",
    gleba: "positive",
    aquilo: "muted",
  };

  // ── Science pack cost table ──────────────────────────────────
  let costColumns = [
    { key: "pack", label: "Science Pack" },
    { key: "count", label: "Total", align: "right" as const },
  ];

  let costRows = $derived(
    Object.entries(data.total_cost)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({
        pack: formatItemName(name),
        count: count.toLocaleString(),
      }))
  );

  // ── Summary KeyValue ─────────────────────────────────────────
  let summaryKV = $derived.by(() => {
    const items: Array<{ key: string; value: string; variant?: "positive" | "negative" | "highlight" | "info" | "warning" | "muted" }> = [
      { key: "Target", value: formatItemName(data.target) },
    ];
    if (data.remaining != null) {
      items.push({ key: "Remaining", value: String(data.remaining) });
    }
    if (data.chain_length != null && !hasSaveData) {
      items.push({ key: "Technologies", value: String(data.chain_length) });
    }
    items.push({ key: "Total Research Time", value: formatTime(data.total_time_seconds) });
    if (data.already_completed != null) {
      items.push({ key: "Already Completed", value: String(data.already_completed), variant: "positive" });
    }
    return items;
  });
</script>

<div class="factorio-view">
  <Panel watermark={data.icon_url}>
    <div class="sections">
      <Section title="Summary">
        {#if isComplete}
          <Badge label="Already Researched" variant="positive" />
        {/if}
        <KeyValue items={summaryKV} />
      </Section>

      {#if !isComplete && data.research_order}
        <Section title="Research Path" count={data.research_order.length}>
          <ol class="research-path">
            {#each data.research_order as step, i}
              <li class="research-step">
                <span class="step-number">{i + 1}</span>
                <span class="step-name">{formatItemName(step.name)}</span>
                {#if step.planet}
                  <Badge label={formatItemName(step.planet)} variant={planetVariant[step.planet] ?? "muted"} />
                {/if}
              </li>
            {/each}
          </ol>
        </Section>
      {/if}

      {#if !isComplete && costRows.length > 0}
        <Section title="Science Pack Cost">
          <DataTable columns={costColumns} rows={costRows} />
        </Section>
      {/if}
    </div>
  </Panel>
</div>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .research-path {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .research-step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-radius: var(--radius-sm, 4px);
    background: color-mix(in srgb, var(--color-surface, #1a1a2e) 80%, transparent);
  }

  .research-step:hover {
    background: color-mix(in srgb, var(--color-surface, #1a1a2e) 100%, transparent);
  }

  .step-number {
    font-family: var(--font-pixel, monospace);
    font-size: 10px;
    color: var(--color-text-muted, #666);
    min-width: 24px;
    text-align: right;
  }

  .step-name {
    font-size: 13px;
    color: var(--color-text-primary, #e0e0e0);
  }
</style>
