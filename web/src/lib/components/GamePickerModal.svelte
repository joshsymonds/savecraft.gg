<!--
  @component
  Modal overlay showing the full game catalog.
  Search/filter, shows watched status per game.
  Watched games can be selected; unwatched games show a config form.
-->
<script lang="ts">
  import type { PickerGame } from "$lib/types/source";
  import { defaultPathForPlatform } from "$lib/utils/platform";

  import ConfigSuccess from "./ConfigSuccess.svelte";
  import DaemonSetup from "./DaemonSetup.svelte";
  import GamePickerCard from "./GamePickerCard.svelte";
  import Modal from "./Modal.svelte";
  import PairingCodeInput from "./PairingCodeInput.svelte";

  export interface ConfigurableSource {
    id: string;
    name: string;
    hostname: string | null;
    platform: string | null;
  }

  let {
    games,
    configurableSources = [],
    onselect,
    onconfigure,
    onoauthconnect,
    onpair,
    onclose,
  }: {
    games: PickerGame[];
    configurableSources?: ConfigurableSource[];
    onselect?: (game: PickerGame) => void;
    onconfigure?: (gameId: string, savePath: string, sourceId: string) => Promise<void>;
    onoauthconnect?: (gameId: string, region: string) => void;
    onpair?: (code: string) => void;
    onclose: () => void;
  } = $props();

  type ModalStep =
    | "browsing"
    | "selectSource"
    | "selectRegion"
    | "configuring"
    | "workshopInstall"
    | "daemonSetup"
    | "ready";

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

  function enterConfigForm(game: PickerGame, sourceId: string) {
    configGame = game;
    selectedSourceId = sourceId;
    const sourcePlatform = configurableSources.find((s) => s.id === sourceId)?.platform;
    configPath = defaultPathForPlatform(sourcePlatform, game.defaultPaths);
    configState = "idle";
    configError = "";
    step = "configuring";
  }

  // Unified picker (#17): dispatch by the game's connection method, not
  // legacy isApiGame/workshopUrl. Hybrid priority: adapter > mod >
  // daemon > reference. Daemon games with no paired daemon get the
  // install+pair step inline (contextual onboarding); reference-only
  // games need no setup.
  function handleCardClick(game: PickerGame) {
    if (game.watched) {
      onselect?.(game);
      return;
    }
    if (game.methods.includes("adapter")) {
      const regions = game.adapter?.regions ?? [];
      // Only ask when there's a real choice. One realm/region (e.g. PoE
      // has only pc) goes straight to OAuth; a lone "PC" button is noise.
      if (regions.length <= 1) {
        onoauthconnect?.(game.gameId, regions[0] ?? "");
      } else {
        configGame = game;
        step = "selectRegion";
      }
    } else if (game.workshopUrl) {
      configGame = game;
      step = "workshopInstall";
    } else if (game.methods.includes("daemon")) {
      configGame = game;
      // Any paired computer: show the hub so the "pair another" leaf is
      // always reachable. No paired computer: the hub would be just that
      // leaf, so go straight to install and pair.
      step = configurableSources.length > 0 ? "selectSource" : "daemonSetup";
    } else {
      // Reference-only; works with zero setup.
      configGame = game;
      step = "ready";
    }
  }

  function handleRegionSelect(region: string) {
    if (configGame) {
      onoauthconnect?.(configGame.gameId, region);
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
      setTimeout(() => onclose(), 1200);
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
    if ((step === "configuring" || step === "daemonSetup") && configurableSources.length > 0) {
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

  // Full, idiomatic region names. A lone "US" code reads as jargon.
  const REGION_LABELS: Record<string, { name: string; sub: string }> = {
    us: { name: "Americas", sub: "US / Latin America / Oceania" },
    eu: { name: "Europe", sub: "EU realms" },
    kr: { name: "Korea", sub: "KR realms" },
    tw: { name: "Taiwan", sub: "TW realms" },
  };

  function handleModalClose() {
    if (step === "browsing") {
      onclose();
    } else {
      handleBack();
    }
  }
</script>

<Modal id="game-picker" onclose={handleModalClose} ariaLabel="Add a game">
  <div class="modal-header">
    {#if step === "browsing"}
      <span class="modal-title">ADD A GAME</span>
    {:else if step === "selectRegion"}
      <button class="modal-back" onclick={handleBack}>&#x2190;</button>
      <span class="modal-title">SELECT YOUR REGION</span>
    {:else if step === "selectSource"}
      <button class="modal-back" onclick={handleBack}>&#x2190;</button>
      <span class="modal-title">WHICH COMPUTER?</span>
    {:else if step === "workshopInstall"}
      <button class="modal-back" onclick={handleBack}>&#x2190;</button>
      <span class="modal-title">INSTALL MOD</span>
    {:else if step === "daemonSetup"}
      <button class="modal-back" onclick={handleBack}>&#x2190;</button>
      <span class="modal-title">SET UP DAEMON</span>
    {:else if step === "ready"}
      <button class="modal-back" onclick={handleBack}>&#x2190;</button>
      <span class="modal-title">{configGame?.name.toUpperCase()}</span>
    {:else}
      <button class="modal-back" onclick={handleBack} disabled={configState === "connecting"}
        >&#x2190;</button
      >
      <span class="modal-title">CONNECT {configGame?.name.toUpperCase()}</span>
    {/if}
    <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
  </div>

  {#if step === "selectRegion"}
    <div class="region-panel">
      <p class="intro-callout">
        Your {configGame?.name} characters live on a regional realm. Pick the region you play. You'll
        sign in to that region's account.
      </p>
      <div class="region-grid">
        {#each configGame?.adapter?.regions ?? [] as region (region)}
          <button class="region-card" onclick={() => handleRegionSelect(region)}>
            <span class="region-name">{REGION_LABELS[region]?.name ?? region.toUpperCase()}</span>
            <span class="region-sub">{REGION_LABELS[region]?.sub ?? region.toUpperCase()}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if step === "workshopInstall"}
    <div class="workshop-panel">
      <div class="workshop-step">
        <span class="workshop-step-number">1</span>
        <div class="workshop-step-content">
          <span class="workshop-step-title">Subscribe</span>
          <p class="workshop-step-desc">
            Subscribe to the Savecraft mod on Steam Workshop. It will download automatically.
          </p>
          <!-- eslint-disable svelte/no-navigation-without-resolve -- external link to Steam Workshop -->
          <a
            class="workshop-button"
            href={configGame?.workshopUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Steam Workshop
          </a>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </div>
      </div>

      <div class="workshop-step">
        <span class="workshop-step-number">2</span>
        <div class="workshop-step-content">
          <span class="workshop-step-title">Enable & play</span>
          <p class="workshop-step-desc">
            Enable the mod in {configGame?.name}'s mod list and start or load a game. The mod
            registers automatically on first load.
          </p>
        </div>
      </div>

      <div class="workshop-step">
        <span class="workshop-step-number">3</span>
        <div class="workshop-step-content">
          <span class="workshop-step-title">Pair</span>
          <p class="workshop-step-desc">A link code appears as an in-game letter. Enter it here:</p>
          <PairingCodeInput onsubmit={onpair} />
          <p class="workshop-step-hint">
            You can also find the code in Options &rarr; Mod Settings &rarr; Savecraft.
          </p>
        </div>
      </div>
    </div>
  {:else if step === "selectSource"}
    <div class="source-list">
      <p class="intro-callout">
        Pick which computer's {configGame?.name} save files to use, or pair another computer.
      </p>
      {#each configurableSources as source (source.id)}
        <button class="source-option" onclick={() => handleSourceSelect(source)}>
          <span class="source-name">{source.name}</span>
          {#if source.hostname}
            <span class="source-hostname">{source.hostname}</span>
          {/if}
        </button>
      {/each}
      <button class="source-option pair-another" onclick={() => (step = "daemonSetup")}>
        <span class="source-name">Pair another computer <span class="chev">&rsaquo;</span></span>
        <span class="source-hostname">Install the daemon on a new machine</span>
      </button>
    </div>
  {:else if step === "configuring"}
    <div class="config-form">
      {#if configState === "success"}
        <ConfigSuccess />
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
  {:else if step === "daemonSetup"}
    <DaemonSetup
      {onpair}
      intro={`${configGame?.name ?? ""} keeps its saves on your PC. Install the Savecraft daemon and pair it once. After that it watches those saves for you.`}
    />
  {:else if step === "ready"}
    <div class="ready-panel">
      <span class="ready-title">{configGame?.name} is ready.</span>
      <p class="ready-desc">
        Savecraft provides reference modules and expert knowledge for {configGame?.name}. Live
        character data is not available yet.
      </p>
    </div>
  {:else}
    <div class="modal-search">
      <input type="text" placeholder="Search games..." bind:value={search} class="search-input" />
    </div>
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
</Modal>

<style>
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
    font-size: 11px;
    color: var(--color-gold);
    letter-spacing: 2px;
    flex: 1;
  }

  .modal-back {
    font-family: var(--font-body);
    font-size: 26px;
    line-height: 1;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 10px;
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
    font-size: 10px;
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
    font-size: 11px;
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

  /* Reference-ready */

  .ready-panel {
    padding: 24px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ready-title {
    font-family: var(--font-pixel);
    font-size: 15px;
    color: var(--color-green, #5abe8a);
    letter-spacing: 0.5px;
    margin: 0;
  }

  .ready-desc {
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--color-text-dim);
    line-height: 1.55;
    margin: 0;
  }

  /* Workshop install */

  .workshop-panel {
    padding: 18px;
    display: flex;
    flex-direction: column;
  }

  .workshop-step {
    display: flex;
    gap: 12px;
    padding: 14px 0;
    border-bottom: 1px solid rgba(74, 90, 173, 0.08);
  }

  .workshop-step:last-child {
    border-bottom: none;
  }

  .workshop-step-number {
    font-family: var(--font-pixel);
    font-size: 13px;
    color: var(--color-gold);
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-gold);
    border-radius: 3px;
    flex-shrink: 0;
  }

  .workshop-step-content {
    flex: 1;
    min-width: 0;
  }

  .workshop-step-title {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 4px;
  }

  .workshop-step-desc {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.4;
    margin: 0 0 8px;
  }

  .workshop-step-hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 8px 0 0;
    line-height: 1.4;
  }

  .workshop-button {
    display: inline-block;
    font-family: var(--font-pixel);
    font-size: 10px;
    letter-spacing: 1.5px;
    padding: 8px 14px;
    color: var(--color-text);
    background: rgba(198, 212, 223, 0.12);
    border: 1px solid rgba(198, 212, 223, 0.25);
    border-radius: 3px;
    text-decoration: none;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .workshop-button:hover {
    background: rgba(198, 212, 223, 0.22);
    border-color: rgba(198, 212, 223, 0.4);
  }

  /* The one designed intro element — a gold-accented callout, not dim
     floating text. Shared by the region / computer / daemon steps. */

  .intro-callout {
    font-family: var(--font-body);
    font-size: 17px;
    line-height: 1.55;
    color: var(--color-text);
    margin: 0 0 16px;
    padding: 14px 16px;
    background: linear-gradient(90deg, rgba(200, 168, 78, 0.12), rgba(200, 168, 78, 0.03));
    border-left: 3px solid var(--color-gold);
    border-radius: 0 4px 4px 0;
  }

  /* Region selection */

  .region-panel {
    padding: 16px 18px;
  }

  .region-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .region-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.18);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .region-card:hover {
    background: rgba(110, 168, 254, 0.12);
    border-color: var(--color-blue, #6ea8fe);
  }

  .region-name {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .region-sub {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  /* Source selection */

  .source-list {
    padding: 16px 18px;
  }

  .source-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 0;
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

  .source-option.pair-another {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    margin-top: 8px;
    border-bottom: none;
    border-top: 1px solid rgba(200, 168, 78, 0.25);
    padding-top: 16px;
  }

  .pair-another .source-name {
    color: var(--color-gold);
  }

  .chev {
    margin-left: 4px;
    opacity: 0.7;
  }
</style>
