<!--
  @component
  Dashboard: source status strip + game-centric main area + activity sidebar.
-->
<script lang="ts">
  import {
    createNote,
    deleteGame,
    deleteNote,
    deleteSave,
    fetchNotes,
    fetchOAuthAuthorizeUrl,
    fetchRemovedSaves,
    restoreSave,
    saveSourceConfig,
    toNoteSummary,
    updateNote,
  } from "$lib/api/client";
  import {
    ActivityEvent,
    AddSourceModal,
    Banner,
    ConnectCard,
    EmptySourceState,
    GameDetailModal,
    GamePanel,
    GamePickerModal,
    LinkingCard,
    SaveDetailModal,
    SourceCardGrid,
    SourceDetailModal,
    StatusDot,
  } from "$lib/components";
  import { RelayedMessage } from "$lib/proto/savecraft/v1/protocol";
  import type { Message, TestPathResult } from "$lib/proto/savecraft/v1/protocol";
  import { activityEvents, pushActivityEvent } from "$lib/stores/activity";
  import { mergeGames } from "$lib/stores/games";
  import { consumePendingLinkCode } from "$lib/stores/link-code";
  import {
    cancelLink,
    dismissLinkError,
    linkCode,
    linkError,
    linkState,
    submitLinkCode,
  } from "$lib/stores/link-flow";
  import { gameDisplayName, plugins } from "$lib/stores/plugins";
  import { configResults, resetConfigResults, sources } from "$lib/stores/sources";
  import { clearTestPathResult, testPathResult } from "$lib/stores/testpath";
  import type {
    Game,
    PickerGame,
    RemovedSave,
    Save,
    Source,
    SourceStatus,
    ValidationState,
  } from "$lib/types/source";
  import { relativeTime } from "$lib/utils/time";
  import { connectionStatus, type ConnectionStatus, send } from "$lib/ws/client";

  function deriveValidationState(
    result: TestPathResult | null,
    checking: boolean,
  ): ValidationState {
    if (result) return result.valid ? "valid" : "invalid";
    if (checking) return "checking";
    return "idle";
  }

  async function saveConfigAndWait(
    sourceId: string,
    gameId: string,
    savePath: string,
  ): Promise<void> {
    const manifest = $plugins.get(gameId);
    const fileExtensions = manifest?.file_extensions ?? [];
    resetConfigResults();
    await saveSourceConfig(sourceId, {
      [gameId]: { savePath, enabled: true, fileExtensions },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Daemon didn't respond — config saved but not yet validated"));
      }, 10_000);
      const unsubscribe = configResults.subscribe((results) => {
        const entry = results[gameId];
        if (entry) {
          clearTimeout(timeout);
          unsubscribe();
          if (entry.success) resolve();
          else reject(new Error(entry.error));
        }
      });
    });
  }

  const COLLAPSED_EVENT_COUNT = 8;

  // Consume pending link code from localStorage synchronously on first render.
  const pendingCode = consumePendingLinkCode();
  if (pendingCode) {
    void submitLinkCode(pendingCode);
  }

  // -- Adapter OAuth redirect params --
  let adapterError: { gameId: string; detail: string } | undefined = $state();

  // Read and consume OAuth redirect params from the URL on first render.
  {
    const params = new URLSearchParams(globalThis.location.search);
    const error = params.get("error");
    const errorDetail = params.get("error_detail");
    const gameId = params.get("game_id");

    if (error && gameId) {
      adapterError = { gameId, detail: errorDetail ?? error };
      pushActivityEvent(
        "oauth_failed",
        `${gameDisplayName(gameId)} connection failed`,
        errorDetail ?? error,
      );
    } else if (params.has("connected") && gameId) {
      pushActivityEvent("oauth_connected", `${gameDisplayName(gameId)} connected`);
    }

    // Clean URL params after consuming (don't pollute browser history)
    if (params.has("connected") || params.has("error") || params.has("game_id")) {
      const cleanUrl = new URL(globalThis.location.href);
      cleanUrl.searchParams.delete("connected");
      cleanUrl.searchParams.delete("error");
      cleanUrl.searchParams.delete("error_detail");
      cleanUrl.searchParams.delete("game_id");
      globalThis.history.replaceState({}, "", cleanUrl.toString());
    }
  }

  let activityExpanded = $state(false);
  let showLinkInput = $state(false);
  let wasManualInput = $state(false);

  // -- Source detail modal --
  let selectedSource: Source | null = $state(null);

  // -- Add source modal --
  let addSourceOpen = $state(false);

  // -- Game picker modal --
  let pickerOpen = $state(false);

  // -- Game detail modal (includes source config) --
  let testPathChecking = $state(false);

  // Clear checking state when testPath result arrives
  $effect(() => {
    if ($testPathResult) testPathChecking = false;
  });

  let selectedGame: Game | null = $state(null);
  let selectedSave: Save | null = $state(null);
  let removedSaves: RemovedSave[] = $state([]);

  async function loadRemovedSaves(gameId: string) {
    try {
      const saves = await fetchRemovedSaves(gameId);
      removedSaves = saves.map((s) => ({
        ...s,
        removedAt: relativeTime(s.removedAt),
      }));
    } catch {
      removedSaves = [];
    }
  }

  // -- Derived game data --
  let mergedGames = $derived(
    mergeGames($sources).map((g) => ({
      ...g,
      iconUrl: $plugins.get(g.gameId)?.icon_url,
    })),
  );
  let showSourceBadges = $derived($sources.length > 1);

  // -- Game picker catalog --
  let pickerGames = $derived.by((): PickerGame[] => {
    const watchedIds = new Set(mergedGames.map((g) => g.gameId));
    const result: PickerGame[] = [];
    for (const [gameId, manifest] of $plugins) {
      const merged = mergedGames.find((g) => g.gameId === gameId);
      const isApi = manifest.source === "api";
      const isModule = manifest.source === "mod";
      result.push({
        gameId,
        name: manifest.name,
        iconUrl: manifest.icon_url,
        description: isApi
          ? manifest.name
          : isModule
            ? manifest.description
            : `Parses ${manifest.file_extensions.join(", ")} files`,
        watched: watchedIds.has(gameId),
        saveCount: merged?.saves.length ?? 0,
        defaultPaths: manifest.default_paths,
        isApiGame: isApi || undefined,
        workshopUrl: manifest.workshop_url,
        adapter: manifest.adapter,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  });

  function handleManualLink(code: string): void {
    wasManualInput = true;
    showLinkInput = false;
    addSourceOpen = false;
    void submitLinkCode(code);
  }

  function handleDismissError(): void {
    dismissLinkError();
    if (wasManualInput) {
      showLinkInput = true;
      wasManualInput = false;
    }
  }

  function handleCancelLink(): void {
    cancelLink();
    if (wasManualInput) {
      showLinkInput = true;
      wasManualInput = false;
    }
  }

  let visibleEvents = $derived(
    activityExpanded ? $activityEvents : $activityEvents.slice(0, COLLAPSED_EVENT_COUNT),
  );
  let hiddenCount = $derived($activityEvents.length - COLLAPSED_EVENT_COUNT);

  const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
    connected: "LIVE",
    connecting: "CONNECTING",
    reconnecting: "RECONNECTING",
    disconnected: "OFFLINE",
  };

  const CONNECTION_STATUS: Record<ConnectionStatus, SourceStatus> = {
    connected: "online",
    connecting: "offline",
    reconnecting: "offline",
    disconnected: "offline",
  };

  function sendTestPath(sourceId: string, gameId: string, path: string): void {
    const innerMsg: Message = {
      payload: {
        $case: "testPath",
        testPath: { gameId, path },
      },
    };
    const relayed: RelayedMessage = {
      sourceId,
      serverTimestamp: undefined,
      message: innerMsg,
    };
    send(RelayedMessage.encode(relayed).finish());
  }
</script>

<svelte:head>
  <title>Dashboard — Savecraft</title>
</svelte:head>

<div class="dashboard-layout">
  <!-- Main column: strip + content -->
  <div class="main-column">
    {#if $connectionStatus === "reconnecting"}
      <Banner color="var(--color-text-muted)" dot>Reconnecting to server...</Banner>
    {/if}

    <main class="content">
      {#if $sources.length > 0}
        <SourceCardGrid
          sources={$sources}
          oncardclick={(source) => {
            selectedSource = source;
          }}
          onadd={() => {
            addSourceOpen = true;
          }}
        />
      {/if}
      {#if $linkState === "linking"}
        <LinkingCard cardState="linking" displayCode={$linkCode} ondismiss={handleCancelLink} />
      {:else if $linkState === "error"}
        <LinkingCard cardState="error" errorMessage={$linkError} ondismiss={handleDismissError} />
      {:else if showLinkInput}
        <LinkingCard
          cardState="input"
          onsubmit={handleManualLink}
          ondismiss={() => (showLinkInput = false)}
        />
      {/if}

      {#if $sources.length === 0}
        {#if $connectionStatus === "connecting"}
          <div class="empty-state">
            <span class="empty-text">Connecting...</span>
          </div>
        {:else if $linkState !== "linking"}
          <EmptySourceState
            onsubmit={handleManualLink}
            onapiskip={() => {
              pickerOpen = true;
            }}
          />
        {/if}
      {:else}
        <ConnectCard />

        <GamePanel
          games={mergedGames}
          {adapterError}
          onadd={() => {
            pickerOpen = true;
          }}
          ongameclick={(game) => {
            selectedGame = game;
            void loadRemovedSaves(game.gameId);
          }}
          onreconnect={(gameId) => {
            adapterError = undefined;
            const manifest = $plugins.get(gameId);
            if (manifest?.adapter) {
              // Re-open game picker so user can re-initiate connection
              pickerOpen = true;
            }
          }}
          onremove={async (gameId) => {
            adapterError = undefined;
            await deleteGame(gameId);
          }}
        />
      {/if}
    </main>
  </div>

  <!-- Sidebar: activity feed -->
  <aside class="activity-sidebar">
    <div class="activity-header">
      <span class="activity-label">ACTIVITY</span>
      <span
        class="live-indicator"
        class:live={$connectionStatus === "connected"}
        class:offline={$connectionStatus !== "connected"}
      >
        <StatusDot status={CONNECTION_STATUS[$connectionStatus]} size={5} />
        {CONNECTION_LABEL[$connectionStatus]}
      </span>
    </div>
    <div class="activity-feed">
      {#each visibleEvents as activityEvent, index (activityEvent.id)}
        <ActivityEvent
          type={activityEvent.type}
          message={activityEvent.message}
          detail={activityEvent.detail}
          time={activityEvent.time}
          isNew={index === 0}
        />
      {/each}
      {#if !activityExpanded && hiddenCount > 0}
        <button class="show-more" onclick={() => (activityExpanded = true)}>
          Show {hiddenCount} more
        </button>
      {:else if activityExpanded && $activityEvents.length > COLLAPSED_EVENT_COUNT}
        <button class="show-more" onclick={() => (activityExpanded = false)}> Show less </button>
      {/if}
      {#if $activityEvents.length === 0}
        <div class="empty-feed">
          <span class="empty-feed-text">No activity yet</span>
        </div>
      {/if}
    </div>
  </aside>
</div>

<!-- Modals -->
{#if addSourceOpen}
  <AddSourceModal
    onsubmit={handleManualLink}
    onapiskip={() => {
      addSourceOpen = false;
      pickerOpen = true;
    }}
    onclose={() => {
      addSourceOpen = false;
    }}
  />
{/if}

{#if selectedSource}
  <SourceDetailModal
    source={selectedSource}
    onclose={() => {
      selectedSource = null;
    }}
  />
{/if}

{#if selectedGame}
  {@const currentGame = selectedGame}
  <GameDetailModal
    game={currentGame}
    showSourceBadges={showSourceBadges && currentGame.sourceCount > 1}
    availableSources={$sources
      .filter(
        (s) =>
          s.capabilities.canReceiveConfig &&
          !currentGame.sources.some((gs) => gs.sourceId === s.id),
      )
      .map((s) => ({ id: s.id, name: s.name, hostname: s.hostname, platform: s.platform }))}
    defaultPaths={$plugins.get(currentGame.gameId)?.default_paths}
    onclose={() => {
      selectedGame = null;
      selectedSave = null;
      removedSaves = [];
      testPathChecking = false;
      clearTestPathResult();
    }}
    onsaveclick={(save) => {
      selectedSave = save;
    }}
    {removedSaves}
    onremovegame={async (gameId) => {
      await deleteGame(gameId);
    }}
    onrestoresave={async (saveUuid) => {
      await restoreSave(saveUuid);
      if (selectedGame) void loadRemovedSaves(selectedGame.gameId);
    }}
    onsave={async (sourceId, savePath) => {
      if (!selectedGame) return;
      await saveConfigAndWait(sourceId, selectedGame.gameId, savePath);
    }}
    ontestpath={(sourceId, path) => {
      if (!selectedGame) return;
      clearTestPathResult();
      testPathChecking = true;
      sendTestPath(sourceId, selectedGame.gameId, path);
    }}
    testPathResult={$testPathResult
      ? {
          valid: $testPathResult.valid,
          filesFound: $testPathResult.filesFound,
          fileNames: $testPathResult.fileNames,
        }
      : null}
    validationState={deriveValidationState($testPathResult, testPathChecking)}
  />
{/if}

{#if selectedSave}
  <SaveDetailModal
    save={selectedSave}
    onclose={() => {
      selectedSave = null;
    }}
    loadNotes={async (saveUuid) => {
      const notes = await fetchNotes(saveUuid);
      return notes.map((n) => toNoteSummary(n));
    }}
    onnotecreate={async (saveUuid, title, content) => {
      await createNote(saveUuid, title, content);
    }}
    onnotedelete={async (saveUuid, noteId) => {
      await deleteNote(saveUuid, noteId);
    }}
    onnoteedit={async (saveUuid, noteId, title, content) => {
      await updateNote(saveUuid, noteId, { title, content });
    }}
    onremovesave={async (saveUuid) => {
      await deleteSave(saveUuid);
      selectedSave = null;
      if (selectedGame) void loadRemovedSaves(selectedGame.gameId);
    }}
  />
{/if}

{#if pickerOpen}
  <GamePickerModal
    games={pickerGames}
    configurableSources={$sources
      .filter((s) => s.capabilities.canReceiveConfig)
      .map((s) => ({ id: s.id, name: s.name, hostname: s.hostname, platform: s.platform }))}
    onselect={(game) => {
      const merged = mergedGames.find((g) => g.gameId === game.gameId);
      if (merged) selectedGame = merged;
      pickerOpen = false;
    }}
    onconfigure={async (gameId, savePath, sourceId) => {
      if (!sourceId) throw new Error("No configurable source selected");
      await saveConfigAndWait(sourceId, gameId, savePath);
    }}
    onoauthconnect={async (_gameId: string, region: string) => {
      const url = await fetchOAuthAuthorizeUrl(region);
      globalThis.location.href = url;
    }}
    onpair={handleManualLink}
    onclose={() => {
      pickerOpen = false;
    }}
  />
{/if}

<style>
  .dashboard-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    height: 100%;
  }

  .main-column {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* -- Content area ----------------------------------------- */

  .content {
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .empty-state {
    padding: 48px 24px;
    text-align: center;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-text-muted);
  }

  /* -- Activity sidebar ------------------------------------- */

  .activity-sidebar {
    border-left: 1px solid rgba(74, 90, 173, 0.12);
    background: rgba(5, 7, 26, 0.3);
    display: flex;
    flex-direction: column;
  }

  .activity-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.12);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .activity-label {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .live-indicator {
    font-family: var(--font-pixel);
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .live-indicator.live {
    color: var(--color-green);
  }

  .live-indicator.offline {
    color: var(--color-text-muted);
  }

  .activity-feed {
    flex: 1;
    overflow-y: auto;
  }

  .show-more {
    display: block;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    border-top: 1px solid rgba(74, 90, 173, 0.08);
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 1px;
    cursor: pointer;
    text-align: center;
    transition: color 0.15s;
  }

  .show-more:hover {
    color: var(--color-text);
  }

  .empty-feed {
    padding: 24px 18px;
    text-align: center;
  }

  .empty-feed-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }
</style>
