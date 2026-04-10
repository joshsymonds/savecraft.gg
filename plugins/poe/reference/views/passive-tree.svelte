<!--
  @component
  Passive tree node search results view. Shows matching nodes with their
  stats, type badges, and allocation status. Text-only, no canvas.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import StatLine from "../../../../views/src/components/poe/StatLine.svelte";

  interface NodeResult {
    id: number;
    name: string;
    type: "small" | "notable" | "keystone" | "mastery";
    stats: string[];
    allocated?: boolean;
    ascendancy?: string;
  }

  interface Props {
    data: {
      icon_url?: string;
      query?: string;
      results?: NodeResult[];
    };
  }

  let { data }: Props = $props();

  let results = $derived(data.results ?? []);

  function nodeTypeBadge(type: string): { label: string; variant: "legendary" | "info" | "muted" | "rare" } {
    switch (type) {
      case "keystone": return { label: "Keystone", variant: "legendary" };
      case "notable": return { label: "Notable", variant: "info" };
      case "mastery": return { label: "Mastery", variant: "rare" };
      default: return { label: "Passive", variant: "muted" };
    }
  }
</script>

{#if results.length === 0}
  <EmptyState message="No nodes found" detail="Try searching for a keystone, notable, or stat name." />
{:else}
  <div class="passive-tree-view">
    <Panel watermark={data.icon_url}>
      <Section
        title="Node Results"
        subtitle="{results.length} found{data.query ? ` for "${data.query}"` : ''}"
      >
        <div class="node-list">
          {#each results as node}
            <div class="node-card" class:allocated={node.allocated}>
              <div class="node-header">
                <span class="node-name">{node.name}</span>
                <div class="node-badges">
                  {#if node.allocated}
                    <Badge label="Allocated" variant="positive" />
                  {/if}
                  {#each [nodeTypeBadge(node.type)] as badge}
                    <Badge label={badge.label} variant={badge.variant} />
                  {/each}
                </div>
              </div>
              {#if node.ascendancy}
                <div class="node-ascendancy">{node.ascendancy}</div>
              {/if}
              <div class="node-stats">
                {#each node.stats as stat}
                  <StatLine text={stat} />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .passive-tree-view {
    animation: fade-in 0.3s ease-out;
  }

  .node-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .node-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    transition: border-color 0.15s;
  }

  .node-card.allocated {
    border-color: var(--color-gold);
    background: color-mix(in srgb, var(--color-gold) 5%, var(--color-surface));
  }

  .node-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .node-name {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text);
  }

  .node-badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .node-ascendancy {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-xs);
  }

  .node-stats {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
</style>
