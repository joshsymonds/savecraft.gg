<!--
  @component
  Modal overlay showing the full game catalog.
  Search/filter, shows watched status per game.
  Watched games can be selected; unwatched games show a config form.
-->
<script lang="ts">
  import type { PickerGame } from "$lib/types/source";

  import GamePickerCard from "./GamePickerCard.svelte";
  import Panel from "./Panel.svelte";

  export interface ConfigurableSource {
    id: string;
    name: string;
    hostname: string | null;
  }

  let {
    games,
    configurableSources = [],
    onselect,
    onconfigure,
    onclose,
  }: {
    games: PickerGame[];
    configurableSources?: ConfigurableSource[];
    onselect?: (game: PickerGame) => void;
    onconfigure?: (gameId: string, savePath: string, sourceId: string) => Promise<void>;
    onclose?: () => void;
  } = $props();

  type ModalStep = "browsing" | "selectSource" | "configuring";

  let step: ModalStep = $state("browsing");
  let search = $state("");
  let configGame: PickerGame | null = $state(null);
  let selectedSourceId: string | null = $state(null);
  let configPath = $state("");
  let configState: "idle" | "connecting" | "success" | "error" | "timeout" = $state("idle");
  let configError = $state("");

  let filtered = $derived(
    search.trim() === ""
      ? games
      : games.filter(
          (g) =>
            g.name.toLowerCase().includes(search.toLowerCase()) ||
            g.description.toLowerCase().includes(search.toLowerCase()),
        ),
  );

  function detectOS(): "windows" | "linux" | "darwin" {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    if (ua.includes("mac")) return "darwin";
    return "linux";
  }

  function enterConfigForm(game: PickerGame, sourceId: string) {
    configGame = game;
    selectedSourceId = sourceId;
    configPath = game.defaultPaths?.[detectOS()] ?? "";
    configState = "idle";
    configError = "";
    step = "configuring";
  }

  let noSourcesError = $state(false);

  function handleCardClick(game: PickerGame) {
    if (game.watched) {
      onselect?.(game);
    } else if (configurableSources.length > 1) {
      configGame = game;
      noSourcesError = false;
      step = "selectSource";
    } else if (configurableSources.length === 1) {
      const source = configurableSources[0];
      if (source) enterConfigForm(game, source.id);
    } else {
      noSourcesError = true;
    }
  }

  function handleSourceSelect(source: ConfigurableSource) {
    if (configGame) enterConfigForm(configGame, source.id);
  }

  async function handleConnect() {
    if (!configGame || !configPath.trim() || !onconfigure) return;
    configState = "connecting";
    configError = "";
    try {
      await onconfigure(configGame.gameId, configPath.trim(), selectedSourceId ?? "");
      configState = "success";
      setTimeout(() => onclose?.(), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      if (message.includes("didn't respond")) {
        configState = "timeout";
        configError = message;
      } else {
        configState = "error";
        configError = message;
      }
    }
  }

  function handleBack() {
    if (step === "configuring" && configurableSources.length > 1) {
      step = "selectSource";
      configState = "idle";
      configError = "";
    } else {
      configGame = null;
      selectedSourceId = null;
      configState = "idle";
      configError = "";
      step = "browsing";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (step === "browsing") {
        onclose?.();
      } else {
        handleBack();
      }
    }
  }
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-label="Add a game"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="modal-content">
    <Panel>
      <div class="modal-header">
        {#if step === "browsing"}
          <span class="modal-title">ADD A GAME</span>
        {:else if step === "selectSource"}
          <button class="modal-back" onclick={handleBack}>&#x2190;</button>
          <span class="modal-title">SELECT SOURCE</span>
        {:else}
          <button class="modal-back" onclick={handleBack} disabled={configState === "connecting"}
            >&#x2190;</button
          >
          <span class="modal-title">CONNECT {configGame?.name.toUpperCase()}</span>
        {/if}
        <button class="modal-close" onclick={() => onclose?.()}>&#x2715;</button>
      </div>

      {#if step === "selectSource"}
        <div class="source-list">
          {#each configurableSources as source (source.id)}
            <button class="source-option" onclick={() => handleSourceSelect(source)}>
              <span class="source-name">{source.name}</span>
              {#if source.hostname}
                <span class="source-hostname">{source.hostname}</span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if step === "configuring"}
        <div class="config-form">
          {#if configState === "success"}
            <div class="config-success">
              <span class="success-icon">&#x2713;</span>
              <span class="success-text">Connected</span>
            </div>
          {:else}
            <label class="config-label" for="save-path">Save directory</label>
            <input
              id="save-path"
              type="text"
              class="config-input"
              bind:value={configPath}
              placeholder="Enter path to save directory..."
              disabled={configState === "connecting"}
            />
            {#if configError}
              <div class="config-error">{configError}</div>
            {/if}
            <button
              class="config-button"
              onclick={handleConnect}
              disabled={configState === "connecting" || !configPath.trim()}
            >
              {#if configState === "connecting"}
                Connecting...
              {:else if configState === "error" || configState === "timeout"}
                Retry
              {:else}
                Connect Game
              {/if}
            </button>
          {/if}
        </div>
      {:else}
        <div class="modal-search">
          <input
            type="text"
            placeholder="Search games..."
            bind:value={search}
            class="search-input"
          />
        </div>
        {#if noSourcesError}
          <div class="no-sources-error">
            <span class="error-text"
              >No configurable source connected. Install the Savecraft daemon to add games.</span
            >
          </div>
        {/if}
        <div class="modal-list">
          {#each filtered as game (game.gameId)}
            <GamePickerCard {game} onclick={() => handleCardClick(game)} />
          {:else}
            <div class="empty-results">
              <span class="empty-text">No games matching "{search}"</span>
            </div>
          {/each}
        </div>
      {/if}
    </Panel>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 26, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.15s ease-out;
  }

  .modal-content {
    width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: fade-slide-in 0.2s ease-out;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    background: rgba(5, 7, 26, 0.4);
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
    gap: 8px;
  }

  .modal-title {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-gold);
    letter-spacing: 2px;
    flex: 1;
  }

  .modal-back {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 2px;
  }

  .modal-back:hover:not(:disabled) {
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
  }

  .modal-back:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-close {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 2px;
  }

  .modal-close:hover {
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
  }

  .modal-search {
    padding: 12px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-input:focus {
    border-color: var(--color-blue);
  }

  .modal-list {
    overflow-y: auto;
    max-height: 50vh;
  }

  .empty-results {
    padding: 32px 18px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* Config form */

  .config-form {
    padding: 24px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .config-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .config-input {
    width: 100%;
    padding: 10px 12px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    outline: none;
  }

  .config-input::placeholder {
    color: var(--color-text-muted);
  }

  .config-input:focus {
    border-color: var(--color-blue);
  }

  .config-input:disabled {
    opacity: 0.6;
  }

  .config-error {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-red, #e55);
    padding: 6px 0;
  }

  .config-button {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1.5px;
    padding: 10px 18px;
    color: var(--color-text);
    background: rgba(90, 190, 138, 0.15);
    border: 1px solid rgba(90, 190, 138, 0.3);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
    align-self: flex-end;
  }

  .config-button:hover:not(:disabled) {
    background: rgba(90, 190, 138, 0.25);
    border-color: rgba(90, 190, 138, 0.5);
  }

  .config-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-sources-error {
    padding: 10px 18px;
    background: rgba(229, 85, 85, 0.08);
    border-bottom: 1px solid rgba(229, 85, 85, 0.15);
  }

  .no-sources-error .error-text {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-red, #e55);
  }

  /* Source selection */

  .source-list {
    padding: 8px 0;
  }

  .source-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 18px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .source-option:hover {
    background: rgba(74, 90, 173, 0.08);
  }

  .source-name {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text);
  }

  .source-hostname {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
  }

  .config-success {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 0;
    animation: fade-in 0.2s ease-out;
  }

  .success-icon {
    font-size: 24px;
    color: var(--color-green, #5abe8a);
  }

  .success-text {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-green, #5abe8a);
    letter-spacing: 2px;
  }
</style>
