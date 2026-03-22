<!--
  @component
  Games page — lists all supported games from plugin manifests.
-->
<script lang="ts">
  import type { GameInfo } from "./+page.server.ts";

  let { data } = $props<{ data: { games: GameInfo[] } }>();

  let search = $state("");

  let filtered = $derived.by(() => {
    const q = search.toLowerCase().trim();
    if (!q) return data.games;
    return data.games.filter(
      (g: GameInfo) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.referenceModules.some((m: { name: string }) => m.name.toLowerCase().includes(q)),
    );
  });

  const SOURCE_LABELS: Record<string, string> = {
    wasm: "PLUGIN",
    api: "API",
    mod: "MOD",
  };
</script>

<svelte:head>
  <title>Supported Games - Savecraft</title>
  <meta
    name="description"
    content="Games supported by Savecraft — local plugins, in-game mods, and API integrations for AI-powered game state parsing."
  />
</svelte:head>

<div class="page">
  <main class="content">
    <h1 class="page-title">Supported Games</h1>
    <p class="page-subtitle">
      Every game Savecraft supports. Local plugins parse save files on your machine, in-game mods
      push colony state directly, and API integrations connect through official game services.
    </p>

    <div class="search-bar">
      <input
        type="text"
        class="search-input"
        placeholder="Search games, tools..."
        bind:value={search}
      />
      {#if search}
        <button class="search-clear" onclick={() => (search = "")}>&#215;</button>
      {/if}
    </div>

    {#if filtered.length === 0}
      <div class="empty-state">
        <span class="empty-text">No games match "{search}"</span>
      </div>
    {/if}

    <div class="games-list">
      {#each filtered as game (game.gameId)}
        <article class="game-card">
          <div class="card-header">
            <div class="card-icon">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- Icon HTML from build-time plugin manifest, not user input -->
              {@html game.iconHtml}
            </div>
            <div class="card-title-area">
              <h2 class="card-name">{game.name}</h2>
              <div class="card-badges">
                <span class="badge badge-channel">{game.channel.toUpperCase()}</span>
                <span class="badge badge-source"
                  >{SOURCE_LABELS[game.source] ?? game.source.toUpperCase()}</span
                >
                {#if game.coverage !== "full"}
                  <span class="badge badge-coverage">{game.coverage.toUpperCase()}</span>
                {/if}
              </div>
            </div>
          </div>

          <p class="card-description">{game.description}</p>

          {#if game.referenceModules.length > 0}
            <div class="modules-section">
              <span class="modules-label">REFERENCE TOOLS</span>
              <div class="modules-list">
                {#each game.referenceModules as mod (mod.name)}
                  <div class="module-item">
                    <span class="module-name">{mod.name}</span>
                    <span class="module-desc">{mod.description}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if game.limitations.length > 0}
            <div class="limitations-section">
              <span class="limitations-label">LIMITATIONS</span>
              <ul class="limitations-list">
                {#each game.limitations as limitation, index (index)}
                  <li>{limitation}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
  }

  /* -- Content ------------------------------------------------ */
  .content {
    max-width: 800px;
    margin: 0 auto;
    padding: 120px 32px 80px;
  }

  .page-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 8px;
  }

  .page-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin-bottom: 32px;
  }

  /* -- Search ------------------------------------------------- */
  .search-bar {
    position: relative;
    margin-bottom: 32px;
  }

  .search-input {
    width: 100%;
    padding: 12px 16px;
    padding-right: 40px;
    background: rgba(10, 14, 46, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 4px;
    font-family: var(--font-heading);
    font-size: 16px;
    color: var(--color-text);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-input:focus {
    border-color: var(--color-gold);
  }

  .search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 20px;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  .search-clear:hover {
    color: var(--color-text);
  }

  /* -- Empty state --------------------------------------------- */
  .empty-state {
    text-align: center;
    padding: 48px 16px;
  }

  .empty-text {
    font-family: var(--font-heading);
    font-size: 17px;
    color: var(--color-text-muted);
  }

  /* -- Game cards ---------------------------------------------- */
  .games-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .game-card {
    padding: 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    animation: fade-slide-in 0.4s ease-out both;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 12px;
  }

  .card-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 4px;
  }

  .card-icon :global(svg) {
    width: 32px;
    height: 32px;
  }

  .card-icon :global(img) {
    width: 32px;
    height: 32px;
    border-radius: 2px;
  }

  .card-title-area {
    flex: 1;
    min-width: 0;
  }

  .card-name {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 6px;
    letter-spacing: 0.5px;
  }

  .card-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    font-family: var(--font-pixel);
    font-size: 8px;
    letter-spacing: 1.5px;
    padding: 3px 8px;
    border-radius: 2px;
  }

  .badge-channel {
    color: var(--color-gold);
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.25);
  }

  .badge-source {
    color: var(--color-blue);
    background: rgba(74, 154, 234, 0.1);
    border: 1px solid rgba(74, 154, 234, 0.25);
  }

  .badge-coverage {
    color: var(--color-text-dim);
    background: rgba(74, 90, 173, 0.1);
    border: 1px solid rgba(74, 90, 173, 0.25);
  }

  .card-description {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  /* -- Reference modules -------------------------------------- */
  .modules-section {
    margin-bottom: 16px;
  }

  .modules-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
    margin-bottom: 10px;
  }

  .modules-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .module-item {
    padding: 10px 14px;
    background: rgba(5, 7, 26, 0.4);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
  }

  .module-name {
    display: block;
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
  }

  .module-desc {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  /* -- Limitations -------------------------------------------- */
  .limitations-section {
    margin-top: 4px;
  }

  .limitations-label {
    display: block;
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .limitations-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .limitations-list li {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-muted);
    line-height: 1.6;
    padding-left: 16px;
    position: relative;
    margin-bottom: 4px;
  }

  .limitations-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 9px;
    width: 5px;
    height: 5px;
    background: rgba(74, 90, 173, 0.4);
    border-radius: 1px;
  }

  /* -- Responsive --------------------------------------------- */
  @media (max-width: 600px) {
    .content {
      padding: 100px 20px 60px;
    }

    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
  }
</style>
