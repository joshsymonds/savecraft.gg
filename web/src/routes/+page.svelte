<!--
  @component
  Dashboard: source status strip + game-centric main area + activity sidebar.
-->
<script lang="ts">
  import { createNote, deleteNote, fetchNotes, toNoteSummary, updateNote } from "$lib/api/client";
  import {
    ActivityEvent,
    ConnectCard,
    GamePanel,
    GamePickerModal,
    InstallBlock,
    LinkingCard,
    SourceDetailModal,
    SourceStrip,
    StatusDot,
  } from "$lib/components";
  import { activityEvents } from "$lib/stores/activity";
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
  import { plugins } from "$lib/stores/plugins";
  import { sources } from "$lib/stores/sources";
  import type { PickerGame, Source, SourceStatus } from "$lib/types/source";
  import { connectionStatus, type ConnectionStatus } from "$lib/ws/client";

  const COLLAPSED_EVENT_COUNT = 8;

  // Consume pending link code from sessionStorage synchronously on first render.
  const pendingCode = consumePendingLinkCode();
  if (pendingCode) {
    void submitLinkCode(pendingCode);
  }

  let activityExpanded = $state(false);
  let showLinkInput = $state(false);
  let wasManualInput = $state(false);

  // -- Source detail modal --
  let selectedSource: Source | null = $state(null);

  // -- Game picker modal --
  let pickerOpen = $state(false);
  let selectedGameId: string | null = $state(null);

  // -- Derived game data --
  let mergedGames = $derived(mergeGames($sources));
  let showSourceBadges = $derived($sources.length > 1);

  // -- Game picker catalog --
  let pickerGames = $derived.by((): PickerGame[] => {
    const watchedIds = new Set(mergedGames.map((g) => g.gameId));
    const result: PickerGame[] = [];
    for (const [gameId, manifest] of $plugins) {
      const merged = mergedGames.find((g) => g.gameId === gameId);
      result.push({
        gameId,
        name: manifest.name,
        description: `Parses ${manifest.file_extensions.join(", ")} files`,
        watched: watchedIds.has(gameId),
        saveCount: merged?.saves.length ?? 0,
        defaultPaths: manifest.default_paths,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  });

  function handleManualLink(code: string): void {
    wasManualInput = true;
    showLinkInput = false;
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
</script>

<svelte:head>
  <title>Dashboard — Savecraft</title>
</svelte:head>

<div class="dashboard-layout">
  <!-- Main column: strip + content -->
  <div class="main-column">
    {#if $sources.length > 0}
      <SourceStrip
        sources={$sources}
        onchipclick={(source) => {
          selectedSource = source;
        }}
      />
    {/if}

    <main class="content">
      {#if $linkState === "linking"}
        <LinkingCard cardState="linking" code={$linkCode} ondismiss={handleCancelLink} />
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
          <InstallBlock prominent={true} onsubmit={handleManualLink} />
        {/if}
      {:else}
        <ConnectCard />

        {#key selectedGameId}
          <GamePanel
            games={mergedGames}
            {showSourceBadges}
            initialGameId={selectedGameId ?? undefined}
            onadd={() => {
              pickerOpen = true;
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
          />
        {/key}

        <InstallBlock prominent={false} onsubmit={handleManualLink} />
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
{#if selectedSource}
  <SourceDetailModal
    source={selectedSource}
    onclose={() => {
      selectedSource = null;
    }}
  />
{/if}

{#if pickerOpen}
  <GamePickerModal
    games={pickerGames}
    onselect={(game) => {
      selectedGameId = game.gameId;
      pickerOpen = false;
    }}
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
