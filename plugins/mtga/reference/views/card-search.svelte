<script lang="ts">
  interface Card {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText?: string;
    rarity: string;
  }

  let { data }: { data: { cards: Card[]; total: number } } = $props();
</script>

<div class="card-gallery">
  <div class="header">
    <span class="count">{data.total} card{data.total !== 1 ? "s" : ""} found</span>
  </div>
  <div class="grid">
    {#each data.cards as card}
      <div class="card" data-rarity={card.rarity}>
        <div class="card-header">
          <span class="card-name">{card.name}</span>
          <span class="mana-cost">{card.manaCost}</span>
        </div>
        <div class="type-line">{card.typeLine}</div>
        {#if card.oracleText}
          <div class="oracle-text">{card.oracleText}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .card-gallery {
    padding: 16px;
    animation: fade-slide-in 0.3s ease-out;
  }

  .header {
    margin-bottom: 12px;
  }

  .count {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }

  .card {
    background: var(--color-panel-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    transition: border-color 0.15s;
  }

  .card:hover {
    border-color: var(--color-border-light);
  }

  .card[data-rarity="mythic"] { border-left: 3px solid var(--color-red); }
  .card[data-rarity="rare"] { border-left: 3px solid var(--color-gold); }
  .card[data-rarity="uncommon"] { border-left: 3px solid #c0c0c0; }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .card-name {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--color-text);
  }

  .mana-cost {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  .type-line {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }

  .oracle-text {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    line-height: 1.4;
    white-space: pre-wrap;
  }
</style>
