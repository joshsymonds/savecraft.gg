<script lang="ts">
  import type { App } from "@modelcontextprotocol/ext-apps";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";

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

<div class="search-view">
  {#if data.results.length === 0}
    <Panel>
      <EmptyState
        message="No results found"
        detail='No saves or notes matched "{data.query}". Try different keywords or a broader search.'
      />
    </Panel>
  {:else}
    <Panel>
      <Section title="Search" subtitle={data.query}>
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
      </Section>
    </Panel>
  {/if}
</div>

<style>
  .search-view {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  /* ── Result list ── */
  .result-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
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
