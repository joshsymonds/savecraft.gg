<script lang="ts">
  import CardGrid from "../../../../views/src/components/layout/CardGrid.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import MtgCard from "../../../../views/src/components/mtg/MtgCard.svelte";

  interface Card {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText?: string;
    colors?: string[];
    colorIdentity?: string[];
    rarity: string;
    keywords?: string[];
  }

  let { data }: { data: { cards: Card[]; total: number; icon_url?: string } } = $props();
</script>

{#if data.cards.length === 0}
  <div class="empty-container">
    <EmptyState message="No cards found" guidance="Try broadening your search criteria." />
  </div>
{:else}
  <div class="card-search">
    <CardGrid>
      {#each data.cards as card}
        <MtgCard {card} iconUrl={data.icon_url} />
      {/each}
    </CardGrid>
  </div>
{/if}

<style>
  .card-search {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .empty-container {
    padding: var(--space-lg);
  }
</style>
