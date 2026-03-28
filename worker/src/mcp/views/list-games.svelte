<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface Game {
    game_id: string;
    game_name: string;
    saves: { save_name: string; summary: string; last_updated: string }[];
  }

  let { data }: { data: { games: Game[] } } = $props();
</script>

<div class="game-library">
  {#each data.games as game}
    <Panel>
      <Section title={game.game_name} count={game.saves.length}>
        <ul class="save-list">
          {#each game.saves as save}
            <li class="save-item">
              <span class="save-name">{save.save_name}</span>
              <span class="save-summary">{save.summary}</span>
            </li>
          {/each}
        </ul>
      </Section>
    </Panel>
  {/each}
</div>

<style>
  .game-library {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .save-list {
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  .save-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-xs);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .save-item:last-child {
    border-bottom: none;
  }

  .save-item:nth-child(even) {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .save-item:hover {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  .save-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
  }

  .save-summary {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
