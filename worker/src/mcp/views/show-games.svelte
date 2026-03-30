<script lang="ts">
  import type { App } from "@modelcontextprotocol/ext-apps";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import GameIcon from "../../../../views/src/components/data/GameIcon.svelte";
  import HoverTip from "../../../../views/src/components/data/HoverTip.svelte";
  import Tag from "../../../../views/src/components/data/Tag.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import CardGrid from "../../../../views/src/components/layout/CardGrid.svelte";
  import CollapseToggle from "../../../../views/src/components/layout/CollapseToggle.svelte";
  import Divider from "../../../../views/src/components/layout/Divider.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";

  interface Save {
    save_id: string;
    name: string;
    summary: string;
    last_updated: string;
    notes: { note_id: string; title: string }[];
  }

  interface Reference {
    id: string;
    name: string;
    description: string;
  }

  interface Game {
    game_id: string;
    game_name: string;
    icon_url?: string;
    saves: Save[];
    removed_saves?: string[];
    references?: Reference[];
  }

  let { data }: { data: { games: Game[] }; app?: App } = $props();
</script>

{#if data.games.length === 0}
  <div class="container">
    <EmptyState
      message="No games connected"
      detail="Connect a game to get started. Ask about setup or mention a pairing code."
    />
  </div>
{:else}
  <div class="game-list">
    <CardGrid minWidth={280}>
      {#each data.games as game (game.game_id)}
        <Panel compact>
          <!-- Game header -->
          <div class="game-header">
            <GameIcon iconUrl={game.icon_url} name={game.game_name} size={36} />
            <div class="game-info">
              <span class="game-name">{game.game_name}</span>
              <span class="game-meta">
                {game.saves.length} {game.saves.length === 1 ? "save" : "saves"}
                {#if game.references?.length}
                  <span class="meta-dot">&middot;</span>
                  {game.references.length} {game.references.length === 1 ? "module" : "modules"}
                {/if}
              </span>
            </div>
          </div>

          <!-- Save roster -->
          {#if game.saves.length > 0}
            <Divider decoration="diamond" />
            <div class="save-list">
              {#each game.saves as save (save.save_id)}
                <div class="save-row">
                  <div class="save-main">
                    <span class="save-name">{save.name}</span>
                    {#if save.notes.length > 0}
                      <Badge label="{save.notes.length} {save.notes.length === 1 ? 'note' : 'notes'}" variant="info" />
                    {/if}
                  </div>
                  <div class="save-detail">
                    <span class="save-summary">{save.summary}</span>
                    <span class="save-time">{save.last_updated}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Reference modules -->
          {#if game.references && game.references.length > 0}
            <Divider decoration="none" />
            <CollapseToggle
              label="{game.references.length} reference {game.references.length === 1 ? 'module' : 'modules'}"
            >
              <div class="ref-list">
                {#each game.references as ref (ref.id)}
                  <HoverTip>
                    {#snippet tip()}
                      <span class="ref-tooltip-prompt">Ask the AI to use this for</span>
                      {ref.description}
                    {/snippet}
                    <Tag label={ref.name} color="var(--color-gold)" />
                  </HoverTip>
                {/each}
              </div>
            </CollapseToggle>
          {/if}

          <!-- Removed saves -->
          {#if game.removed_saves && game.removed_saves.length > 0}
            <Divider decoration="none" />
            <CollapseToggle
              label="{game.removed_saves.length} removed {game.removed_saves.length === 1 ? 'save' : 'saves'}"
              muted
            >
              <div class="removed-list">
                {#each game.removed_saves as name}
                  <span class="removed-name">{name}</span>
                {/each}
              </div>
            </CollapseToggle>
          {/if}
        </Panel>
      {/each}
    </CardGrid>
  </div>
{/if}

<style>
  .container {
    padding: var(--space-lg);
  }

  .game-list {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  /* ── Game header ── */
  .game-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .game-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .game-name {
    font-family: var(--font-pixel);
    font-size: 11px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .game-meta {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .meta-dot {
    margin: 0 2px;
  }

  /* ── Save roster ── */
  .save-list {
    display: flex;
    flex-direction: column;
  }

  .save-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-xs) var(--space-sm);
  }

  .save-main {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .save-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-detail {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .save-summary {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-time {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-left: var(--space-xs);
  }

  /* ── Reference module list ── */
  .ref-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .ref-tooltip-prompt {
    display: block;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-xs);
  }

  /* ── Removed saves ── */
  .removed-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .removed-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .removed-name::before {
    content: "\2715 ";
    font-size: 10px;
    margin-right: 4px;
  }
</style>
