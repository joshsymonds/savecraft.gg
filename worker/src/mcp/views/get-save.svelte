<script lang="ts">
  import type { App } from "@modelcontextprotocol/ext-apps";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

  interface SectionInfo {
    name: string;
    description: string;
  }

  interface Note {
    note_id: string;
    title: string;
    source: string;
    size_bytes: number;
  }

  interface SaveData {
    save_id: string;
    game_id: string;
    game_name?: string;
    name: string;
    summary: string;
    icon_url?: string;
    overview: Record<string, unknown> | null;
    sections: SectionInfo[];
    notes: Note[];
    refresh_status?: string;
    refresh_error?: string;
  }

  let { data, app }: { data: SaveData; app?: App } = $props();

  let iconError = $state(false);

  function formatOverviewValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function formatOverviewLabel(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  let overviewEntries = $derived(
    data.overview
      ? Object.entries(data.overview)
          .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
          .map(([k, v]) => ({ label: formatOverviewLabel(k), value: formatOverviewValue(v) }))
      : [],
  );

  function onSectionClick(section: SectionInfo) {
    app?.updateModelContext({
      context: `Player is looking at the "${section.name}" section of ${data.name}. Description: ${section.description}. Save ID: ${data.save_id}`,
    });
  }

  function onNoteClick(note: Note) {
    app?.updateModelContext({
      context: `Player clicked note "${note.title}" on ${data.name}. Note ID: ${note.note_id}, Save ID: ${data.save_id}`,
    });
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  function sourceLabel(source: string): string {
    if (source === "ai") return "AI";
    if (source === "player") return "Player";
    return source;
  }
</script>

<div class="save-detail">
  <Panel>
    <!-- Header -->
    <div class="header">
      <span class="game-icon" class:fallback={!data.icon_url || iconError}>
        {#if data.icon_url && !iconError}
          <img
            src={data.icon_url}
            alt={data.game_name ?? data.game_id}
            width="32"
            height="32"
            onerror={() => (iconError = true)}
          />
        {:else}
          {(data.game_name ?? data.game_id).charAt(0).toUpperCase()}
        {/if}
      </span>
      <div class="header-text">
        <h1 class="save-name">{data.name}</h1>
        <p class="save-summary">{data.summary}</p>
      </div>
      {#if data.refresh_status}
        <Badge
          label={data.refresh_status}
          variant={data.refresh_status === "error" ? "negative" : data.refresh_status === "ok" ? "positive" : "muted"}
        />
      {/if}
    </div>

    {#if data.refresh_error}
      <div class="refresh-error">
        <Badge label="Refresh Error" variant="negative" />
        <span class="error-text">{data.refresh_error}</span>
      </div>
    {/if}
  </Panel>

  <!-- Overview -->
  {#if overviewEntries.length > 0}
    <Panel>
      <Section title="Overview" count={overviewEntries.length}>
        <KeyValue entries={overviewEntries} columns={2} />
      </Section>
    </Panel>
  {/if}

  <!-- Sections -->
  <Panel>
    <Section title="Sections" count={data.sections.length} subtitle="Ask about any section to explore its data">
      <div class="section-grid">
        {#each data.sections as section (section.name)}
          <button
            class="section-card"
            onclick={() => onSectionClick(section)}
            type="button"
          >
            <span class="section-name">{section.name.replace(/_/g, " ")}</span>
            <span class="section-desc">{section.description}</span>
          </button>
        {/each}
      </div>
    </Section>
  </Panel>

  <!-- Notes -->
  {#if data.notes.length > 0}
    <Panel>
      <Section title="Notes" count={data.notes.length}>
        <div class="note-list">
          {#each data.notes as note (note.note_id)}
            <button
              class="note-row"
              onclick={() => onNoteClick(note)}
              type="button"
            >
              <div class="note-main">
                <span class="note-title">{note.title}</span>
                <Badge label={sourceLabel(note.source)} variant={note.source === "ai" ? "info" : "muted"} />
              </div>
              <span class="note-size">{formatBytes(note.size_bytes)}</span>
            </button>
          {/each}
        </div>
      </Section>
    </Panel>
  {/if}
</div>

<style>
  .save-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .game-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-gold) 25%, transparent);
    flex-shrink: 0;
    overflow: hidden;
  }

  .game-icon.fallback {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-gold);
  }

  .game-icon img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .save-name {
    font-family: var(--font-pixel);
    font-size: 14px;
    color: var(--color-gold);
    letter-spacing: 1px;
    margin: 0;
  }

  .save-summary {
    font-family: var(--font-heading);
    font-size: 16px;
    color: var(--color-text-dim);
    margin: 2px 0 0;
  }

  .refresh-error {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: color-mix(in srgb, var(--color-red) 8%, transparent);
    border-radius: var(--radius-sm);
  }

  .error-text {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  /* ── Sections grid ── */
  .section-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-sm);
  }

  .section-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }

  .section-card:hover {
    border-color: color-mix(in srgb, var(--color-gold) 40%, var(--color-border));
    background: color-mix(in srgb, var(--color-gold) 4%, var(--color-surface));
  }

  .section-name {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    text-transform: capitalize;
  }

  .section-desc {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.3;
  }

  /* ── Notes list ── */
  .note-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .note-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
    width: 100%;
  }

  .note-row:hover {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  .note-main {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
    flex: 1;
  }

  .note-title {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-size {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
</style>
