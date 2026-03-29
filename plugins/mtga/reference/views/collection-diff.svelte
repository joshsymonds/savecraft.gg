<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import WildcardCost from "../../../../views/src/components/mtg/WildcardCost.svelte";

  interface MissingCard {
    name: string;
    count: number;
    rarity: string;
  }

  interface WildcardCostData {
    common: number;
    uncommon: number;
    rare: number;
    mythic: number;
    unknown: number;
    total: number;
  }

  let { data }: {
    data: {
      missing: MissingCard[];
      wildcardCost: WildcardCostData;
      unresolvedCards: string[];
    };
  } = $props();

  const RARITY_VARIANT: Record<string, string> = {
    mythic: "legendary",
    rare: "rare",
    uncommon: "uncommon",
    common: "common",
  };

  let columns = [
    { key: "name", label: "Card", align: "left" as const },
    { key: "count", label: "Need", align: "right" as const },
    { key: "rarity", label: "Rarity", align: "right" as const },
  ];

  let rows = $derived(
    data.missing.map((card) => ({
      name: card.name,
      count: card.count,
      rarity: card.rarity,
    })),
  );
</script>

{#if data.missing.length === 0}
  <div class="container">
    <EmptyState message="Deck is complete" guidance="You have all the cards needed for this deck." />
  </div>
{:else}
  <div class="collection-diff">
    <Panel>
      <Section title="Wildcards Needed">
        <WildcardCost cost={data.wildcardCost} />
      </Section>
    </Panel>

    <Panel>
      <Section title="Missing Cards">
        <DataTable {columns} {rows} />
      </Section>
    </Panel>

    {#if data.unresolvedCards.length > 0}
      <div class="unresolved">
        <span class="unresolved-label">Could not resolve:</span>
        {#each data.unresolvedCards as card}
          <Badge label={card} variant="warning" />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .container {
    padding: var(--space-lg);
  }

  .collection-diff {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .unresolved {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
  }

  .unresolved-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-warning);
  }
</style>
