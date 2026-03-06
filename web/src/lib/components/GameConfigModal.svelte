<!--
  @component
  Game-centric configuration modal.
  Shows sources providing a game with status. Clicking a source or "+" opens
  SourceEditModal as a stacked modal on top.
-->
<script lang="ts">
  import type {
    AvailableSource,
    GameSourceEntry,
    TestPathResult,
    ValidationState,
  } from "$lib/types/source";

  import DropdownMenu from "./DropdownMenu.svelte";
  import Modal from "./Modal.svelte";
  import SourceEditModal from "./SourceEditModal.svelte";
  import StatusDot from "./StatusDot.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    gameName,
    gameId,
    sources = [],
    availableSources = [],
    defaultPath,
    onclose,
    onsave,
    ontestpath,
    testPathResult = null,
    validationState = "idle",
  }: {
    gameName: string;
    gameId: string;
    sources?: GameSourceEntry[];
    availableSources?: AvailableSource[];
    defaultPath?: string;
    onclose: () => void;
    onsave?: (sourceId: string, savePath: string) => Promise<void>;
    ontestpath?: (sourceId: string, path: string) => void;
    testPathResult?: TestPathResult | null;
    validationState?: ValidationState;
  } = $props();

  // -- Stacked modal state --

  let editingSourceId: string | null = $state(null);
  let editingSourceName: string | null = $state(null);
  let editingPath: string = $state("");

  // -- Dropdown options derived from availableSources --
  let dropdownOptions = $derived(
    availableSources.map((s) => ({
      id: s.id,
      label: s.name,
      sublabel: s.hostname ?? undefined,
    })),
  );

  // Auto-open edit for single broken source (once only)
  let hasAutoOpened = false;
  $effect(() => {
    if (hasAutoOpened) return;
    if (sources.length === 1 && sources[0] && sources[0].status !== "watching") {
      hasAutoOpened = true;
      const source = sources[0];
      openEditor(source.sourceId, source.sourceName, source.path ?? defaultPath ?? "");
    }
  });

  function statusToDot(status: GameSourceEntry["status"]): "online" | "error" | "offline" {
    if (status === "watching") return "online";
    if (status === "error") return "error";
    return "offline";
  }

  function statusLabel(status: GameSourceEntry["status"]): string {
    if (status === "watching") return "WATCHING";
    if (status === "error") return "ERROR";
    return "NOT FOUND";
  }

  function openEditor(sourceId: string, sourceName: string, path: string) {
    editingSourceId = sourceId;
    editingSourceName = sourceName;
    editingPath = path;
  }

  function handleSourceClick(source: GameSourceEntry) {
    openEditor(source.sourceId, source.sourceName, source.path ?? defaultPath ?? "");
  }

  function handleDropdownPick(option: { id: string; label: string }) {
    openEditor(option.id, option.label, defaultPath ?? "");
  }

  function closeEditor() {
    editingSourceId = null;
    editingSourceName = null;
    editingPath = "";
  }

  function handleEditClose() {
    // If we auto-opened for a single broken source, close everything
    if (sources.length === 1 && sources[0]?.status !== "watching") {
      onclose();
    } else {
      closeEditor();
    }
  }
</script>

<Modal
  id="game-config-{gameId}"
  onclose={() => onclose()}
  width="520px"
  ariaLabel="Configure {gameName}"
>
  <WindowTitleBar activeLabel={gameName.toUpperCase()} activeSublabel="Sources">
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>

  <div class="sources-section">
    <div class="sources-header">
      <span class="section-label">SOURCES</span>
      {#if availableSources.length > 0}
        <DropdownMenu label="ADD SOURCE" options={dropdownOptions} onpick={handleDropdownPick} />
      {/if}
    </div>

    {#each sources as source (source.sourceId)}
      <button class="source-row" onclick={() => handleSourceClick(source)}>
        <div class="source-row-left">
          <StatusDot status={statusToDot(source.status)} size={6} />
          <span class="source-name">{source.sourceName}</span>
        </div>
        <div class="source-row-right">
          <span
            class="status-badge"
            class:watching={source.status === "watching"}
            class:error-status={source.status === "error"}
            class:not-found={source.status === "not_found"}
          >
            {statusLabel(source.status)}
          </span>
        </div>
      </button>
      {#if source.path}
        <div class="source-path">{source.path}</div>
      {/if}
      {#if source.error}
        <div class="source-error">{source.error}</div>
      {/if}
    {:else}
      <div class="empty-sources">
        <span class="empty-text">No sources configured for this game.</span>
        {#if availableSources.length > 0}
          <DropdownMenu label="ADD SOURCE" options={dropdownOptions} onpick={handleDropdownPick} />
        {:else}
          <span class="empty-hint">Link a device first to configure this game.</span>
        {/if}
      </div>
    {/each}
  </div>

  {#snippet footer()}
    <button class="modal-btn" onclick={() => onclose()}>DISMISS</button>
  {/snippet}
</Modal>

<!-- Stacked: path editor -->
{#if editingSourceId}
  <SourceEditModal
    {gameName}
    {gameId}
    sourceId={editingSourceId}
    sourceName={editingSourceName ?? ""}
    initialPath={editingPath}
    {onsave}
    {ontestpath}
    {testPathResult}
    {validationState}
    onclose={handleEditClose}
  />
{/if}

<style>
  /* -- Sources section ----------------------------------------- */

  .sources-section {
    padding: 0;
  }

  .sources-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px 8px;
  }

  .section-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-gold);
    letter-spacing: 2px;
  }

  .source-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 18px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(74, 90, 173, 0.06);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .source-row:hover {
    background: rgba(74, 90, 173, 0.06);
  }

  .source-row-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .source-name {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text);
    letter-spacing: 0.5px;
  }

  .source-row-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-badge {
    font-family: var(--font-pixel);
    font-size: 6px;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .status-badge.watching {
    color: var(--color-green);
    background: rgba(90, 190, 138, 0.1);
    border: 1px solid rgba(90, 190, 138, 0.2);
  }

  .status-badge.error-status {
    color: var(--color-yellow);
    background: rgba(232, 180, 90, 0.1);
    border: 1px solid rgba(232, 180, 90, 0.2);
  }

  .status-badge.not-found {
    color: var(--color-text-muted);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.1);
  }

  .source-path {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
    padding: 0 18px 8px 44px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-error {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-red, #e85a5a);
    padding: 0 18px 8px 44px;
  }

  /* -- Empty states -------------------------------------------- */

  .empty-sources {
    padding: 28px 18px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .empty-text {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-muted);
  }

  .empty-hint {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-muted);
    opacity: 0.7;
  }
</style>
