<script lang="ts">
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import CardGrid from "../../../../views/src/components/layout/CardGrid.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";

  interface Card {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText?: string;
    rarity: string;
  }

  let { data }: { data: { cards: Card[]; total: number } } = $props();

  const rarityVariant: Record<string, string> = {
    mythic: "legendary",
    rare: "rare",
    uncommon: "uncommon",
    common: "common",
  };

  const rarityAccent: Record<string, string> = {
    mythic: "var(--color-rarity-legendary)",
    rare: "var(--color-rarity-rare)",
    uncommon: "var(--color-rarity-uncommon)",
    common: "var(--color-rarity-common)",
  };
</script>

<div class="card-gallery">
  <Panel>
    <Section title="Card Search" count={data.total}>
      <CardGrid>
        {#each data.cards as card}
          <Panel nested accent={rarityAccent[card.rarity]} padding="var(--space-md)">
            <div class="card-header">
              <span class="card-name">{card.name}</span>
              <span class="mana-cost">{card.manaCost}</span>
            </div>
            <div class="card-meta">
              <span class="type-line">{card.typeLine}</span>
              <Badge label={card.rarity} variant={rarityVariant[card.rarity] ?? "muted"} />
            </div>
            {#if card.oracleText}
              <div class="oracle-text">{card.oracleText}</div>
            {/if}
          </Panel>
        {/each}
      </CardGrid>
    </Section>
  </Panel>
</div>

<style>
  .card-gallery {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-xs);
  }

  .card-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .mana-cost {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .type-line {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .oracle-text {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    line-height: 1.4;
    white-space: pre-wrap;
  }
</style>
