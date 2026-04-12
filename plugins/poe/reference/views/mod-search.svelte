<!--
  @component
  Mod search results view. Shows matching mods as expandable tier tables
  with stat ranges, spawn weights, and prefix/suffix filtering.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import FilterBar from "../../../../views/src/components/data/FilterBar.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import StatLine from "../../../../views/src/components/poe/StatLine.svelte";

  interface ModTier {
    tier: number;
    name: string;
    level: number;
    text: string;
  }

  interface ModResult {
    mod_name: string;
    generation_type: string;
    tiers: ModTier[];
  }

  interface Props {
    data: {
      icon_url?: string;
      query?: string;
      generation_type?: string;
      item_class?: string;
      mods: ModResult[];
      count: number;
    };
  }

  let { data }: Props = $props();

  // --- Filter state ---

  const generationFilters = [
    { label: "Prefix", value: "prefix", color: "var(--color-info)" },
    { label: "Suffix", value: "suffix", color: "var(--color-positive)" },
  ];

  let activeGenerationFilters = $state<string[]>([]);

  let filteredMods = $derived.by(() => {
    return data.mods.filter((mod) => {
      if (activeGenerationFilters.length > 0 && !activeGenerationFilters.includes(mod.generation_type)) return false;
      return true;
    });
  });

  // --- Tier variant mapping ---

  type TierVariant = "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor";

  function tierVariant(tier: number): TierVariant {
    if (tier === 1) return "legendary";
    if (tier === 2) return "epic";
    if (tier === 3) return "rare";
    if (tier === 4) return "uncommon";
    if (tier <= 6) return "common";
    return "poor";
  }

  function tierLabel(tier: number): string {
    return `T${tier}`;
  }

  // --- DataTable columns ---

  const columns = [
    { key: "tier", label: "Tier", align: "center" as const, sortable: true, width: "60px" },
    { key: "name", label: "Affix", sortable: true, width: "140px" },
    { key: "text", label: "Mod Text", sortable: false },
    { key: "level", label: "iLvl", align: "center" as const, sortable: true, width: "60px" },
  ];

  /** Build DataTable rows from a mod's tiers */
  function tierRows(tiers: ModTier[]) {
    return tiers.map((t) => ({
      tier: { value: tierLabel(t.tier), variant: tierVariant(t.tier), sortValue: t.tier },
      name: t.name || "—",
      text: t.text,
      level: t.level,
    }));
  }
</script>

{#if data.mods.length === 0}
  <EmptyState message="No mods found" detail="Try a different search term, mod name, or stat description." />
{:else}
  <div class="mod-search">
    <Panel watermark={data.icon_url}>
      <Section
        title="Mod Search"
        subtitle="{filteredMods.length} mod{filteredMods.length !== 1 ? 's' : ''}{data.query ? ` for "${data.query}"` : ''}"
      >
        {#if generationFilters.length > 0}
          <div class="filters">
            <FilterBar
              filters={generationFilters}
              active={activeGenerationFilters}
              onchange={(v) => (activeGenerationFilters = v)}
            />
          </div>
        {/if}

        {#if filteredMods.length === 0}
          <EmptyState message="No mods match filters" detail="Try adjusting the prefix/suffix or domain filters above." />
        {:else}
          <div class="mod-list">
            {#each filteredMods as mod}
              <div class="mod-group">
                <div class="mod-header">
                  <StatLine
                    text={mod.mod_name}
                    variant={mod.generation_type === "prefix" ? "explicit" : "crafted"}
                  />
                  <div class="mod-badges">
                    <Badge
                      label={mod.generation_type}
                      variant={mod.generation_type === "prefix" ? "info" : "positive"}
                    />
                  </div>
                </div>
                <DataTable
                  columns={columns}
                  rows={tierRows(mod.tiers)}
                  sortKey="tier"
                  sortDir="asc"
                />
              </div>
            {/each}
          </div>
        {/if}
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .mod-search {
    animation: fade-in 0.3s ease-out;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .mod-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .mod-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .mod-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
  }

  .mod-badges {
    display: flex;
    gap: var(--space-xs);
    flex-shrink: 0;
  }
</style>
