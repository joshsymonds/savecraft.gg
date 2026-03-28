<!--
  @component
  Collapsible legal attribution footer.
  Rendered once at the bottom of every view iframe by the build pipeline.
  Styled to integrate seamlessly with the design system at any widget width.
-->
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
    <div class="attribution-divider"></div>
    <button class="attribution-toggle" onclick={() => (expanded = !expanded)}>
      <span class="attribution-arrow" class:expanded></span>
      <span class="attribution-label">Legal</span>
      <span class="attribution-chips">
        {#each entries as entry, i}
          {#if i > 0}<span class="attribution-dot"></span>{/if}
          <span class="attribution-chip">{entry.name}</span>
        {/each}
      </span>
    </button>
    {#if expanded}
      <div class="attribution-body">
        {#each entries as entry}
          <p class="attribution-disclaimer">
            {entry.disclaimer}
            <a class="attribution-link" href={entry.url} target="_blank" rel="noopener">Policy</a>
          </p>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .attribution {
    margin-top: var(--space-lg);
    padding-top: 0;
    animation: fade-in 0.3s ease-out;
  }

  .attribution-divider {
    height: 1px;
    margin-bottom: var(--space-sm);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-border) 20%, transparent) 0%,
      color-mix(in srgb, var(--color-border) 40%, transparent) 50%,
      color-mix(in srgb, var(--color-border) 20%, transparent) 100%
    );
  }

  .attribution-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-xs) 0;
    width: 100%;
    text-align: left;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.4;
    transition: color 0.15s;
  }

  .attribution-toggle:hover {
    color: var(--color-text-dim);
  }

  .attribution-arrow {
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 4px 0 4px 6px;
    border-color: transparent transparent transparent currentColor;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .attribution-arrow.expanded {
    transform: rotate(90deg);
  }

  .attribution-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .attribution-chips {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    overflow: hidden;
  }

  .attribution-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.3;
    flex-shrink: 0;
  }

  .attribution-chip {
    opacity: 0.6;
    font-size: 12px;
  }

  .attribution-body {
    padding: var(--space-sm) 0 var(--space-xs) 18px;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    animation: fade-in 0.15s ease-out;
  }

  .attribution-disclaimer {
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .attribution-link {
    color: var(--color-info);
    text-decoration: none;
    margin-left: 4px;
    font-size: 11px;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .attribution-link:hover {
    text-decoration: underline;
    opacity: 1;
  }
</style>
