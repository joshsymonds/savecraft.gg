<!--
  @component
  Source configuration modal. Lets users enable/disable games,
  set save paths, and test paths against the connected source.
-->
<script lang="ts">
  import { fetchSourceConfig, type GameConfigInput, saveSourceConfig } from "$lib/api/client";
  import type { PluginManifest } from "$lib/api/client";
  import { detectOS } from "$lib/platform";
  import { discoveredGames } from "$lib/stores/discovery";
  import { loadPlugins, plugins } from "$lib/stores/plugins";
  import { clearTestPathResult, testPathResult } from "$lib/stores/testpath";
  import { send } from "$lib/ws/client";
  import { SvelteMap } from "svelte/reactivity";

  import Panel from "./Panel.svelte";
  import TinyButton from "./TinyButton.svelte";

  interface Props {
    sourceId: string;
    onclose: () => void;
  }

  let { sourceId, onclose }: Props = $props();

  // Local editing state: gameId -> config
  let games = new SvelteMap<string, GameConfigInput>();
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);
  let testingGameId = $state<string | null>(null);

  // Track which game's test result we're showing
  let testResult = $derived.by(() => {
    const result = $testPathResult;
    if (!result) return null;
    if ((result.gameId ?? null) !== testingGameId) return null;
    return result;
  });

  // Load current config on mount
  $effect(() => {
    void loadConfig();
  });

  async function loadConfig(): Promise<void> {
    loading = true;
    error = null;
    testingGameId = null;
    clearTestPathResult();

    try {
      // Ensure plugins are loaded before building the game list.
      if ($plugins.size === 0) {
        await loadPlugins();
      }

      const existing = await fetchSourceConfig(sourceId);
      games.clear();

      // Start with all available plugins
      for (const [gameId, plugin] of $plugins) {
        const saved = existing[gameId];
        if (saved) {
          games.set(gameId, { ...saved });
        } else {
          // Default: disabled, pre-fill path from discovery or manifest
          const os = detectOS();
          const discovered = $discoveredGames.get(gameId);
          games.set(gameId, {
            savePath: discovered?.path ?? plugin.default_paths[os] ?? "",
            enabled: false,
            fileExtensions: plugin.file_extensions,
          });
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load config";
    } finally {
      loading = false;
    }
  }

  function toggleGame(gameId: string): void {
    const config = games.get(gameId);
    if (!config) return;

    const plugin = $plugins.get(gameId);
    const updated = { ...config, enabled: !config.enabled };

    // When enabling with no path, pre-fill from discovery or manifest
    if (updated.enabled && !updated.savePath && plugin) {
      const os = detectOS();
      const discovered = $discoveredGames.get(gameId);
      updated.savePath = discovered?.path ?? plugin.default_paths[os] ?? "";
    }

    games.set(gameId, updated);
  }

  function updatePath(gameId: string, value: string): void {
    const config = games.get(gameId);
    if (!config) return;
    games.set(gameId, { ...config, savePath: value });
  }

  function testPath(gameId: string): void {
    const config = games.get(gameId);
    if (!config?.savePath) return;

    testingGameId = gameId;
    clearTestPathResult();

    send(
      JSON.stringify({
        testPath: { gameId, path: config.savePath },
      }),
    );
  }

  async function handleSave(): Promise<void> {
    saving = true;
    error = null;
    try {
      // Send all games (enabled + disabled) to preserve paths.
      // The server stores the enabled flag per row -- disabled games
      // keep their config so the user can re-enable without re-entering paths.
      const toSave: Record<string, GameConfigInput> = Object.fromEntries(games);
      await saveSourceConfig(sourceId, toSave);
      saving = false;
      saved = true;
      setTimeout(() => {
        onclose();
      }, 600);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save config";
      saving = false;
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function pluginName(gameId: string, plugin: PluginManifest | undefined): string {
    return plugin?.name ?? gameId;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdropClick}>
  <div class="modal">
    <Panel>
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">SOURCE CONFIG</span>
          <span class="source-id">{sourceId}</span>
          <button class="close-button" onclick={onclose}>&times;</button>
        </div>

        {#if loading}
          <div class="loading-state">Loading config...</div>
        {:else}
          {#if error}
            <div class="error-banner">{error}</div>
          {/if}

          <div class="game-list">
            {#each [...games] as [gameId, config] (gameId)}
              {@const plugin = $plugins.get(gameId)}
              <div class="game-row" class:disabled={!config.enabled}>
                <div class="game-row-header">
                  <label class="game-toggle">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onchange={() => {
                        toggleGame(gameId);
                      }}
                    />
                    <span class="game-name-label">{pluginName(gameId, plugin)}</span>
                  </label>
                  <div class="ext-chips">
                    {#each config.fileExtensions as extension (extension)}
                      <span class="ext-chip">{extension}</span>
                    {/each}
                  </div>
                </div>

                {#if !config.enabled}
                  {@const discovered = $discoveredGames.get(gameId)}
                  {#if discovered && discovered.fileCount > 0}
                    <div class="discovery-hint">
                      Found at {discovered.path} ({discovered.fileCount} files)
                    </div>
                  {/if}
                {/if}

                {#if config.enabled}
                  <div class="path-row">
                    <input
                      class="path-input"
                      type="text"
                      placeholder="Save directory path..."
                      value={config.savePath}
                      oninput={(inputEvent) => {
                        updatePath(gameId, inputEvent.currentTarget.value);
                      }}
                    />
                    <TinyButton
                      label="TEST"
                      onclick={() => {
                        testPath(gameId);
                      }}
                    />
                  </div>

                  {#if testResult && testingGameId === gameId}
                    <div
                      class="test-result"
                      class:valid={testResult.valid}
                      class:invalid={!testResult.valid}
                    >
                      {#if testResult.valid}
                        Found {testResult.filesFound} file{testResult.filesFound === 1 ? "" : "s"}
                      {:else}
                        No matching files found
                      {/if}
                    </div>
                  {/if}

                  {#if plugin?.coverage === "partial"}
                    <div class="coverage-note">
                      Partial coverage -- some features may be missing
                    </div>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>

          {#if games.size === 0}
            <div class="empty-state">No plugins available</div>
          {/if}

          <div class="modal-footer">
            <TinyButton label="CANCEL" onclick={onclose} />
            <TinyButton
              label={(() => {
                if (saved) return "SAVED \u2713";
                if (saving) return "SAVING...";
                return "SAVE";
              })()}
              onclick={handleSave}
              disabled={saving || saved}
            />
          </div>
        {/if}
      </div>
    </Panel>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.15s ease-out;
  }

  .modal {
    width: 560px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-content {
    padding: 0;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.15);
    background: rgba(5, 7, 26, 0.4);
  }

  .modal-title {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .source-id {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-dim);
    flex: 1;
  }

  .close-button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-button:hover {
    color: var(--color-text);
  }

  .loading-state,
  .empty-state {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
    text-align: center;
    padding: 32px 18px;
  }

  .error-banner {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-red);
    padding: 8px 18px;
    background: rgba(232, 90, 90, 0.1);
    border-bottom: 1px solid rgba(232, 90, 90, 0.2);
  }

  /* -- Game list -------------------------------------------- */

  .game-list {
    padding: 8px 0;
  }

  .game-row {
    padding: 12px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
    transition: opacity 0.15s;
  }

  .game-row.disabled {
    opacity: 0.5;
  }

  .game-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .game-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .game-toggle input[type="checkbox"] {
    accent-color: var(--color-gold);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .game-name-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .ext-chips {
    display: flex;
    gap: 4px;
  }

  .ext-chip {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.08);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    padding: 1px 6px;
  }

  /* -- Path input ------------------------------------------- */

  .path-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }

  .path-input {
    flex: 1;
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.2);
    border-radius: 3px;
    padding: 6px 10px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s;
  }

  .path-input::placeholder {
    color: var(--color-text-muted);
  }

  .path-input:focus {
    border-color: var(--color-border-light);
  }

  /* -- Test result ------------------------------------------ */

  .test-result {
    font-family: var(--font-body);
    font-size: 15px;
    margin-top: 6px;
    padding: 4px 0;
  }

  .test-result.valid {
    color: var(--color-green);
  }

  .test-result.invalid {
    color: var(--color-yellow);
  }

  .coverage-note {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    margin-top: 4px;
    font-style: italic;
  }

  .discovery-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-green);
    margin-top: 4px;
  }

  /* -- Footer ----------------------------------------------- */

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    background: rgba(5, 7, 26, 0.4);
  }
</style>
