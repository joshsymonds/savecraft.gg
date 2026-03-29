<!--
  @component
  Research tree & crafting chain navigator view.
  List mode: all projects grouped by tech level.
  Chain mode: prerequisite chain as timeline with total cost.
-->
<script lang="ts">
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import Timeline from "../../../../views/src/components/charts/Timeline.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface ProjectEntry {
    name: string;
    def_name: string;
    cost: number;
    tech_level: string;
    prerequisites: string[];
  }

  interface Props {
    data: {
      // List mode
      projects?: ProjectEntry[];
      count?: number;
      // Chain mode
      chain?: string[];
      total_cost?: number;
      colony_tech?: string;
    };
  }

  let { data }: Props = $props();

  let isListMode = $derived(!!data.projects);

  function techLevelVariant(level: string): "info" | "uncommon" | "warning" | "rare" | "epic" | "legendary" {
    const map: Record<string, "info" | "uncommon" | "warning" | "rare" | "epic" | "legendary"> = {
      Neolithic: "info",
      Medieval: "uncommon",
      Industrial: "warning",
      Spacer: "rare",
      Ultra: "epic",
      Archotech: "legendary",
    };
    return map[level] ?? "info";
  }

  let listColumns = [
    { key: "name", label: "Project", sortable: true },
    { key: "tech_level", label: "Tech Level", sortable: true },
    { key: "cost", label: "Cost", align: "right" as const, sortable: true },
  ];

  let listRows = $derived(
    (data.projects ?? []).map((p) => ({
      name: p.name,
      tech_level: { value: p.tech_level, variant: techLevelVariant(p.tech_level) } as const,
      cost: p.cost,
    })),
  );

  let chainEvents = $derived(
    (data.chain ?? []).map((name, i) => ({
      label: name,
      value: `${i + 1}`,
      variant: "info" as const,
      marker: `${i + 1}`,
    })),
  );
</script>

<Panel>
  {#if isListMode}
    <Section title="Research Projects">
      <DataTable columns={listColumns} rows={listRows} sortKey="cost" sortDir="desc" />
    </Section>
  {:else}
    <Section title="Research Chain">
      {#snippet badge()}
        {#if data.colony_tech}
          <Badge label={data.colony_tech.toUpperCase()} variant={techLevelVariant(data.colony_tech)} />
        {/if}
      {/snippet}

      <div class="chain-layout">
        <div class="hero">
          <Stat value={Math.round(data.total_cost ?? 0).toLocaleString()} label="Total Research Cost" variant="highlight" />
        </div>

        <Panel nested>
          <span class="sub-label">Prerequisites</span>
          <Timeline events={chainEvents} />
        </Panel>
      </div>
    </Section>
  {/if}
</Panel>

<style>
  .chain-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hero {
    display: flex;
    justify-content: center;
    padding: var(--space-md) 0;
  }

</style>
