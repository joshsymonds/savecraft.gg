<script lang="ts">
  interface Game {
    game_id: string;
    game_name: string;
    saves: { save_name: string; summary: string; last_updated: string }[];
  }

  let { data }: { data: { games: Game[] } } = $props();
</script>

<div class="game-library">
  {#each data.games as game}
    <div class="game-card">
      <h2 class="game-name">{game.game_name}</h2>
      <ul class="save-list">
        {#each game.saves as save}
          <li class="save-item">
            <span class="save-name">{save.save_name}</span>
            <span class="save-summary">{save.summary}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>

<style>
  .game-library {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    animation: fade-slide-in 0.3s ease-out;
  }

  .game-card {
    background: var(--color-panel-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px;
  }

  .game-name {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-gold);
    margin-bottom: 8px;
  }

  .save-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .save-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
  }

  .save-name {
    font-family: var(--font-heading);
    font-weight: 500;
    color: var(--color-text);
  }

  .save-summary {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
