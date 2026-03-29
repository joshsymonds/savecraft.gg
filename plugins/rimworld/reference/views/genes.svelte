<!--
  @component
  Gene metabolism & xenotype builder view.
  Browse mode: searchable gene table.
  Validate mode: budget bars + gene list + conflict warnings.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import ProgressBar from "../../../../views/src/components/charts/ProgressBar.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface GeneEntry {
    name: string;
    complexity: number;
    metabolism: number;
    archite: number;
    category: string;
    conflicts: string[];
  }

  interface Conflict {
    Gene1: string;
    Gene2: string;
    Tag: string;
  }

  interface Props {
    data: {
      // Browse mode
      genes?: GeneEntry[];
      count?: number;
      // Validate mode
      total_complexity?: number;
      total_metabolism?: number;
      total_archite?: number;
      complexity_ok?: boolean;
      metabolism_ok?: boolean;
      conflicts?: Conflict[];
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  let isBrowseMode = $derived(!!data.genes);

  let browseColumns = [
    { key: "name", label: "Gene", sortable: true },
    { key: "complexity", label: "Cpx", align: "right" as const, sortable: true },
    { key: "metabolism", label: "Met", align: "right" as const, sortable: true },
    { key: "archite", label: "Arc", align: "right" as const, sortable: true },
    { key: "category", label: "Category", sortable: true },
  ];

  let browseRows = $derived(
    (data.genes ?? []).map((g) => ({
      name: g.name,
      complexity: g.complexity,
      metabolism: { value: g.metabolism, variant: (g.metabolism < 0 ? "negative" : g.metabolism > 0 ? "positive" : undefined) } as const,
      archite: g.archite > 0 ? { value: g.archite, variant: "warning" as const } : 0,
      category: g.category,
    })),
  );
</script>

<Panel watermark={data.icon_url}>
  {#if isBrowseMode}
    <Section title="Genes">
      <DataTable columns={browseColumns} rows={browseRows} sortKey="complexity" sortDir="desc" />
    </Section>
  {:else}
    <Section title="Gene Build Validation">
      <div class="validate-layout">
        <div class="budgets">
          <div class="budget-row">
            <span class="budget-label">Complexity</span>
            <ProgressBar
              value={data.total_complexity ?? 0}
              max={6}
              label="{data.total_complexity ?? 0}/6"
              variant={data.complexity_ok ? "positive" : "negative"}
            />
            {#if !data.complexity_ok}
              <Badge label="OVER" variant="negative" />
            {/if}
          </div>
          <div class="budget-row">
            <span class="budget-label">Metabolism</span>
            <ProgressBar
              value={Math.abs(data.total_metabolism ?? 0)}
              max={5}
              label="{data.total_metabolism ?? 0}"
              variant={data.metabolism_ok ? "positive" : "negative"}
            />
            {#if !data.metabolism_ok}
              <Badge label="OVER" variant="negative" />
            {/if}
          </div>
          {#if (data.total_archite ?? 0) > 0}
            <div class="budget-row">
              <span class="budget-label">Archite</span>
              <Badge label="{data.total_archite} capsules" variant="epic" />
            </div>
          {/if}
        </div>

        {#if data.conflicts && data.conflicts.length > 0}
          <Section title="Conflicts" accent="var(--color-negative)">
            <div class="conflicts">
              {#each data.conflicts as conflict}
                <div class="conflict-row">
                  <Badge label="CONFLICT" variant="negative" />
                  <span class="conflict-text">{conflict.Gene1} vs {conflict.Gene2}</span>
                  <span class="conflict-tag">({conflict.Tag})</span>
                </div>
              {/each}
            </div>
          </Section>
        {/if}
      </div>
    </Section>
  {/if}
</Panel>

<style>
  .validate-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .budgets {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .budget-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .budget-label {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    min-width: 90px;
    flex-shrink: 0;
  }

  .conflicts {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .conflict-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: color-mix(in srgb, var(--color-negative) 8%, transparent);
    border-radius: var(--radius-md);
  }

  .conflict-text {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .conflict-tag {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }
</style>
