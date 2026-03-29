<script lang="ts">
  import type { App } from "@modelcontextprotocol/ext-apps";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import GameIcon from "../../../../views/src/components/data/GameIcon.svelte";
  import HoverTip from "../../../../views/src/components/data/HoverTip.svelte";
  import Tag from "../../../../views/src/components/data/Tag.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";

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

  let expandedRefs: Record<string, boolean> = $state({});
  let expandedRemoved: Record<string, boolean> = $state({});

  function toggleRefs(gameId: string) {
    expandedRefs[gameId] = !expandedRefs[gameId];
  }

  function toggleRemoved(gameId: string) {
    expandedRemoved[gameId] = !expandedRemoved[gameId];
  }

</script>

{#if data.games.length === 0}
  <div class="container">
    <EmptyState
      message="No games connected"
      detail="Connect a game to get started. Ask about setup or mention a pairing code."
    />
  </div>
{:else}
  <div class="game-grid">
    {#each data.games as game (game.game_id)}
      <div class="game-card">
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
          <div class="save-separator"></div>
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
          <div class="section-separator"></div>
          <button
            class="toggle-row"
            onclick={() => toggleRefs(game.game_id)}
            type="button"
          >
            <span class="toggle-arrow" class:expanded={expandedRefs[game.game_id]}>&#x25B8;</span>
            <span class="toggle-label">
              {game.references.length} reference {game.references.length === 1 ? "module" : "modules"}
            </span>
          </button>
          {#if expandedRefs[game.game_id]}
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
          {/if}
        {/if}

        <!-- Removed saves -->
        {#if game.removed_saves && game.removed_saves.length > 0}
          <div class="section-separator"></div>
          <button
            class="toggle-row muted"
            onclick={() => toggleRemoved(game.game_id)}
            type="button"
          >
            <span class="toggle-arrow" class:expanded={expandedRemoved[game.game_id]}>&#x25B8;</span>
            <span class="toggle-label">
              {game.removed_saves.length} removed {game.removed_saves.length === 1 ? "save" : "saves"}
            </span>
          </button>
          {#if expandedRemoved[game.game_id]}
            <div class="removed-list">
              {#each game.removed_saves as name}
                <span class="removed-name">{name}</span>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .container {
    padding: var(--space-lg);
  }

  .game-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .game-card {
    display: flex;
    flex-direction: column;
    background: var(--color-panel-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
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
  .save-separator {
    height: 1px;
    margin: var(--space-sm) 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--color-border) 60%, transparent) 50%,
      transparent 100%
    );
  }

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

  /* ── Toggle rows (ref modules, removed saves) ── */
  .section-separator {
    height: 1px;
    margin: var(--space-xs) 0;
    background: color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    text-align: left;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
  }

  .toggle-row:hover {
    background: color-mix(in srgb, var(--color-border) 10%, transparent);
  }

  .toggle-row.muted {
    opacity: 0.6;
  }

  .toggle-arrow {
    font-size: 10px;
    color: var(--color-text-muted);
    transition: transform 0.15s;
    display: inline-block;
  }

  .toggle-arrow.expanded {
    transform: rotate(90deg);
  }

  .toggle-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  /* ── Reference module list ── */
  .ref-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    animation: fade-in 0.2s ease-out;
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
    padding: var(--space-xs) var(--space-sm);
    animation: fade-in 0.2s ease-out;
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
