<!--
  @component
  Device configuration modal. Lets users enable/disable games,
  set save paths, and test paths against the connected daemon.
-->
<script lang="ts">
  import { fetchDeviceConfig, saveDeviceConfig, type GameConfigInput } from "$lib/api/client";
  import type { PluginManifest } from "$lib/api/client";
  import { plugins } from "$lib/stores/plugins";
  import { testPathResult, clearTestPathResult } from "$lib/stores/testpath";
  import { send } from "$lib/ws/client";
  import Panel from "./Panel.svelte";
  import TinyButton from "./TinyButton.svelte";

  interface Props {
    deviceId: string;
    onclose: () => void;
  }

  let { deviceId, onclose }: Props = $props();

  // Local editing state: gameId → config
  let games = $state<Map<string, GameConfigInput>>(new Map());
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let testingGameId = $state<string | null>(null);

  // Track which game's test result we're showing
  let testResult = $derived.by(() => {
    const result = $testPathResult;
    if (!result || result.gameId !== testingGameId) return null;
    return result;
  });

  function detectOS(): "windows" | "linux" | "darwin" {
    const platform = navigator.platform.toLowerCase();
    if (platform.startsWith("win")) return "windows";
    if (platform.startsWith("mac")) return "darwin";
    return "linux";
  }

  // Load current config on mount
  $effect(() => {
    void loadConfig();
  });

  async function loadConfig(): Promise<void> {
    loading = true;
    error = null;
    try {
      const existing = await fetchDeviceConfig(deviceId);
      const map = new Map<string, GameConfigInput>();

      // Start with all available plugins
      for (const [gameId, plugin] of $plugins) {
        const saved = existing[gameId];
        if (saved) {
          map.set(gameId, { ...saved });
        } else {
          // Default: disabled, pre-fill path from manifest
          const os = detectOS();
          map.set(gameId, {
            savePath: plugin.default_paths[os] ?? "",
            enabled: false,
            fileExtensions: plugin.file_extensions,
          });
        }
      }

      games = map;
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

    // When enabling with no path, pre-fill from manifest
    if (updated.enabled && !updated.savePath && plugin) {
      const os = detectOS();
      updated.savePath = plugin.default_paths[os] ?? "";
    }

    games.set(gameId, updated);
    // Trigger reactivity
    games = new Map(games);
  }

  function updatePath(gameId: string, value: string): void {
    const config = games.get(gameId);
    if (!config) return;
    games.set(gameId, { ...config, savePath: value });
    games = new Map(games);
  }

  function testPath(gameId: string): void {
    const config = games.get(gameId);
    if (!config?.savePath) return;

    testingGameId = gameId;
    clearTestPathResult();

    send(JSON.stringify({
      testPath: { gameId, path: config.savePath },
    }));
  }

  async function handleSave(): Promise<void> {
    saving = true;
    error = null;
    try {
      // Only include enabled games in the save
      const toSave: Record<string, GameConfigInput> = {};
      for (const [gameId, config] of games) {
        if (config.enabled) {
          toSave[gameId] = config;
        }
      }
      await saveDeviceConfig(deviceId, toSave);
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save config";
    } finally {
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" role="presentation" onclick={handleBackdropClick}>
  <div class="modal">
    <Panel>
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">DEVICE CONFIG</span>
          <span class="device-id">{deviceId}</span>
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
                      onchange={() => toggleGame(gameId)}
                    />
                    <span class="game-name-label">{pluginName(gameId, plugin)}</span>
                  </label>
                  <div class="ext-chips">
                    {#each config.fileExtensions as ext}
                      <span class="ext-chip">{ext}</span>
                    {/each}
                  </div>
                </div>

                {#if config.enabled}
                  <div class="path-row">
                    <input
                      class="path-input"
                      type="text"
                      placeholder="Save directory path..."
                      value={config.savePath}
                      oninput={(e) => updatePath(gameId, e.currentTarget.value)}
                    />
                    <TinyButton label="TEST" onclick={() => testPath(gameId)} />
                  </div>

                  {#if testResult && testingGameId === gameId}
                    <div
                      class="test-result"
                      class:valid={testResult.valid}
                      class:invalid={!testResult.valid}
                    >
                      {#if testResult.valid}
                        Found {testResult.filesFound} file{testResult.filesFound !== 1 ? "s" : ""}
                      {:else}
                        No matching files found
                      {/if}
                    </div>
                  {/if}

                  {#if plugin?.coverage === "partial"}
                    <div class="coverage-note">Partial coverage — some features may be missing</div>
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
              label={saving ? "SAVING..." : "SAVE"}
              onclick={handleSave}
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
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .device-id {
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

  /* ── Game list ───────────────────────────────────────── */

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
    font-size: 7px;
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

  /* ── Path input ──────────────────────────────────────── */

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

  /* ── Test result ─────────────────────────────────────── */

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

  /* ── Footer ──────────────────────────────────────────── */

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    background: rgba(5, 7, 26, 0.4);
  }
</style>
