<script lang="ts">
  interface AttributionEntry {
    name: string;
    disclaimer: string;
    url: string;
  }

  let { entries: propEntries }: { entries?: AttributionEntry[] } = $props();

  let expanded = $state(false);

  const windowEntries: AttributionEntry[] =
    typeof window !== "undefined" && Array.isArray((window as any).__ATTRIBUTION__)
      ? (window as any).__ATTRIBUTION__
      : [];

  let entries = $derived(propEntries ?? windowEntries);
</script>

{#if entries.length > 0}
  <div class="attribution">
    <button class="attribution-toggle" onclick={() => (expanded = !expanded)}>
      <span class="attribution-arrow">{expanded ? "\u25be" : "\u25b8"}</span>
      <span class="attribution-label">Legal</span>
      <span class="attribution-chips">
        {#each entries as entry, i}
          {#if i > 0}<span class="attribution-dot">&middot;</span>{/if}
          <span class="attribution-chip">{entry.name}</span>
        {/each}
      </span>
    </button>
    {#if expanded}
      <div class="attribution-body">
        {#each entries as entry}
          <p class="attribution-disclaimer">
            {entry.disclaimer}
            <a class="attribution-link" href={entry.url} target="_blank" rel="noopener"
              >Policy</a
            >
          </p>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .attribution {
    border-top: 1px solid rgba(74, 90, 173, 0.3);
    margin-top: 12px;
    padding-top: 8px;
    animation: fade-in 0.2s ease-out;
  }

  .attribution-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    width: 100%;
    text-align: left;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.4;
  }

  .attribution-toggle:hover {
    color: var(--color-text-dim);
  }

  .attribution-arrow {
    font-size: 10px;
    width: 10px;
    flex-shrink: 0;
  }

  .attribution-label {
    font-weight: 600;
    flex-shrink: 0;
  }

  .attribution-chips {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    overflow: hidden;
  }

  .attribution-dot {
    opacity: 0.4;
  }

  .attribution-chip {
    opacity: 0.7;
  }

  .attribution-body {
    padding: 8px 0 4px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: fade-in 0.15s ease-out;
  }

  .attribution-disclaimer {
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-text-muted);
  }

  .attribution-link {
    color: var(--color-blue);
    text-decoration: none;
    margin-left: 4px;
    font-size: 10px;
  }

  .attribution-link:hover {
    text-decoration: underline;
  }
</style>
