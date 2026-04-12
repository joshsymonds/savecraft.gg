<!--
  @component
  Gem search results view. Shows matching gems as ItemFrame cards
  with tags, per-level stats, requirements, and support compatibility.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import ItemFrame from "../../../../views/src/components/poe/ItemFrame.svelte";
  import StatLine from "../../../../views/src/components/poe/StatLine.svelte";
  import RequirementBar from "../../../../views/src/components/poe/RequirementBar.svelte";

  interface GemResult {
    name: string;
    /** R(str), G(dex), B(int), W(neutral) */
    color: string;
    tags: string[];
    is_support: boolean;
    level_requirement?: number;
    str_requirement?: number;
    dex_requirement?: number;
    int_requirement?: number;
    cast_time?: number;
    mana_cost?: string;
    mana_multiplier?: number;
    description?: string;
    /** Key stats at gem level 20 */
    stats_at_20?: string[];
    /** Per-level scaling info */
    scaling?: Array<{ level: number; stats: string[] }>;
    /** For support gems: what tags it can support */
    supports_tags?: string[];
    /** True if this support cannot modify minion/totem skills */
    cannot_support_minions?: boolean;
    /** Stat text lines that do NOT apply to minions/totems */
    minion_excluded_effects?: string[];
    /** Skill types this support requires */
    require_skill_types?: string[];
    /** Skill types this support refuses */
    exclude_skill_types?: string[];
  }

  interface Props {
    data: {
      icon_url?: string;
      query?: string;
      gems: GemResult[];
    };
  }

  let { data }: Props = $props();
</script>

{#if data.gems.length === 0}
  <EmptyState message="No gems found" detail="Try a different search term or check the gem name." />
{:else}
  <div class="gem-search">
    <Panel watermark={data.icon_url}>
      <Section title="Gem Results" subtitle="{data.gems.length} found{data.query ? ` for "${data.query}"` : ''}">
        <div class="gem-grid">
          {#each data.gems as gem}
            <ItemFrame
              name={gem.name}
              rarity="MAGIC"
              itemType={gem.is_support ? "Support Gem" : "Skill Gem"}
            >
              {#snippet properties()}
                <div class="gem-properties">
                  <div class="gem-tags">
                    {#each gem.tags as tag}
                      <Badge label={tag} variant="muted" />
                    {/each}
                    {#if gem.is_support}
                      <Badge label="Support" variant="info" />
                    {/if}
                    {#if gem.cannot_support_minions}
                      <Badge label="Cannot Support Minions" variant="warning" />
                    {/if}
                  </div>
                  {#if gem.require_skill_types?.length}
                    <div class="gem-tags">
                      {#each gem.require_skill_types as st}
                        <Badge label="Requires: {st}" variant="info" />
                      {/each}
                    </div>
                  {/if}
                  {#if gem.exclude_skill_types?.length}
                    <div class="gem-tags">
                      {#each gem.exclude_skill_types as st}
                        <Badge label="Excludes: {st}" variant="negative" />
                      {/each}
                    </div>
                  {/if}
                  {#if gem.cast_time != null}
                    <div class="gem-prop">Cast Time: <strong>{gem.cast_time}s</strong></div>
                  {/if}
                  {#if gem.mana_cost}
                    <div class="gem-prop">Mana Cost: <strong>{gem.mana_cost}</strong></div>
                  {/if}
                  {#if gem.mana_multiplier}
                    <div class="gem-prop">Cost Multiplier: <strong>{gem.mana_multiplier}%</strong></div>
                  {/if}
                </div>
              {/snippet}

              {#snippet requirements()}
                <RequirementBar
                  level={gem.level_requirement}
                  str={gem.str_requirement}
                  dex={gem.dex_requirement}
                  int={gem.int_requirement}
                />
              {/snippet}

              {#snippet explicits()}
                <div class="gem-stats">
                  {#if gem.description}
                    <div class="gem-desc">{gem.description}</div>
                  {/if}
                  {#if gem.stats_at_20}
                    {#each gem.stats_at_20 as stat}
                      {#if gem.minion_excluded_effects?.includes(stat)}
                        <StatLine text="{stat} (not for minions/totems)" variant="fractured" />
                      {:else}
                        <StatLine text={stat} />
                      {/if}
                    {/each}
                  {/if}
                </div>
              {/snippet}

              {#if gem.supports_tags}
                {#snippet footer()}
                  <div class="supports-info">
                    Supports: {gem.supports_tags.join(", ")}
                  </div>
                {/snippet}
              {/if}
            </ItemFrame>
          {/each}
        </div>
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .gem-search {
    animation: fade-in 0.3s ease-out;
  }

  .gem-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .gem-properties {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .gem-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .gem-prop {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  .gem-prop strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .gem-stats {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gem-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text);
    line-height: 1.5;
    margin-bottom: var(--space-xs);
  }

  .supports-info {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
    font-style: italic;
  }
</style>
