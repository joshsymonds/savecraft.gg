<script lang="ts">
  import type { App } from "@modelcontextprotocol/ext-apps";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";

  interface SearchResult {
    type: string;
    save_id: string;
    save_name: string;
    ref_id: string;
    ref_title: string;
    snippet: string;
  }

  interface SearchData {
    query: string;
    results: SearchResult[];
  }

  let { data, app }: { data: SearchData; app?: App } = $props();

  function onResultClick(result: SearchResult) {
    if (result.type === "note") {
      app?.updateModelContext({
        context: `Player clicked search result: note "${result.ref_title}" on save "${result.save_name}". Note ID: ${result.ref_id}, Save ID: ${result.save_id}`,
      });
    } else {
      app?.updateModelContext({
        context: `Player clicked search result: ${result.ref_title} section of save "${result.save_name}". Save ID: ${result.save_id}`,
      });
    }
  }

  /**
   * Parse **bold** markers from SQLite FTS snippet() into segments.
   * snippet() uses ** as open/close markers.
   */
  function parseSnippet(raw: string): { text: string; bold: boolean }[] {
    const parts: { text: string; bold: boolean }[] = [];
    let remaining = raw;
    while (remaining.length > 0) {
      const openIdx = remaining.indexOf("**");
      if (openIdx === -1) {
        parts.push({ text: remaining, bold: false });
        break;
      }
      if (openIdx > 0) {
        parts.push({ text: remaining.slice(0, openIdx), bold: false });
      }
      const afterOpen = remaining.slice(openIdx + 2);
      const closeIdx = afterOpen.indexOf("**");
      if (closeIdx === -1) {
        parts.push({ text: afterOpen, bold: true });
        break;
      }
      parts.push({ text: afterOpen.slice(0, closeIdx), bold: true });
      remaining = afterOpen.slice(closeIdx + 2);
    }
    return parts;
  }
</script>

{#if data.results.length === 0}
  <div class="container">
    <EmptyState
      message="No results found"
      detail='No saves or notes matched "{data.query}". Try different keywords or a broader search.'
    />
  </div>
{:else}
  <div class="search-results">
    <div class="query-header">
      <span class="query-label">Search</span>
      <span class="query-text">{data.query}</span>
      <span class="result-count">{data.results.length} {data.results.length === 1 ? "result" : "results"}</span>
    </div>

    <div class="result-list">
      {#each data.results as result, i (result.ref_id + "-" + String(i))}
        <button
          class="result-row"
          onclick={() => onResultClick(result)}
          type="button"
        >
          <div class="result-header">
            <Badge
              label={result.type === "note" ? "Note" : "Save Data"}
              variant={result.type === "note" ? "highlight" : "positive"}
            />
            <span class="result-save">{result.save_name}</span>
            <span class="result-sep">&rsaquo;</span>
            <span class="result-title">{result.ref_title}</span>
          </div>
          <p class="result-snippet">
            {#each parseSnippet(result.snippet) as segment}
              {#if segment.bold}
                <mark class="highlight">{segment.text}</mark>
              {:else}
                {segment.text}
              {/if}
            {/each}
          </p>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .container {
    padding: var(--space-lg);
  }

  .search-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  /* ── Query header ── */
  .query-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
  }

  .query-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .query-text {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-gold);
    flex: 1;
  }

  .result-count {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* ── Result list ── */
  .result-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: border-color 0.15s, background 0.15s;
  }

  .result-row:hover {
    border-color: color-mix(in srgb, var(--color-gold) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-gold) 3%, var(--color-surface));
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .result-save {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .result-sep {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .result-title {
    font-family: var(--font-heading);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  .result-snippet {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    line-height: 1.5;
    margin: 0;
  }

  .highlight {
    background: color-mix(in srgb, var(--color-gold) 20%, transparent);
    color: var(--color-gold-light, var(--color-gold));
    border-radius: 2px;
    padding: 0 2px;
  }
</style>
