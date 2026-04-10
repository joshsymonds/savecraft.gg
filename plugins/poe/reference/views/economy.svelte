<!--
  @component
  Economy/pricing view. Shows item prices from poe.ninja with sparkline trends.
  Displays results as compact item cards with price data.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import Sparkline from "../../../../views/src/components/charts/Sparkline.svelte";
  import PriceTag from "../../../../views/src/components/poe/PriceTag.svelte";

  interface PriceResult {
    name: string;
    /** Item type for display (e.g. "Unique Armour", "Currency") */
    type: string;
    /** Base type or subtype */
    base_type?: string;
    /** Current price in chaos */
    chaos_value: number;
    /** Current price in divine */
    divine_value?: number;
    /** Price confidence */
    confidence?: "high" | "low";
    /** Sparkline data points (last 7 days) */
    sparkline?: number[];
    /** Price change percentage (7d) */
    change_7d?: number;
    /** Item icon URL */
    icon_url?: string;
    /** Number of listings */
    listings?: number;
  }

  interface Props {
    data: {
      icon_url?: string;
      query?: string;
      league?: string;
      items: PriceResult[];
    };
  }

  let { data }: Props = $props();

  function changeColor(change: number): string {
    if (change > 5) return "var(--color-positive)";
    if (change < -5) return "var(--color-negative)";
    return "var(--color-text-muted)";
  }

  function changePrefix(change: number): string {
    return change > 0 ? "+" : "";
  }
</script>

{#if data.items.length === 0}
  <EmptyState message="No price data found" detail="Item may not be listed or the name may be incorrect." />
{:else}
  <div class="economy-view">
    <Panel watermark={data.icon_url}>
      <Section
        title="Price Lookup"
        subtitle="{data.league ?? 'Current League'} · {data.items.length} result{data.items.length !== 1 ? 's' : ''}{data.query ? ` for "${data.query}"` : ''}"
      >
        <div class="price-list">
          {#each data.items as item}
            <div class="price-card">
              <div class="price-left">
                {#if item.icon_url}
                  <img class="item-icon" src={item.icon_url} alt="" />
                {/if}
                <div class="item-info">
                  <span class="item-name">{item.name}</span>
                  {#if item.base_type}
                    <span class="item-base">{item.base_type}</span>
                  {/if}
                  <div class="item-meta">
                    <Badge label={item.type} variant="muted" />
                    {#if item.listings}
                      <span class="listings">{item.listings} listed</span>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="price-right">
                <PriceTag
                  chaos={item.chaos_value}
                  divine={item.divine_value}
                  confidence={item.confidence}
                />
                {#if item.sparkline && item.sparkline.length > 1}
                  <div class="trend">
                    <Sparkline
                      values={item.sparkline}
                      color={item.change_7d != null ? changeColor(item.change_7d) : "var(--color-info)"}
                      width={100}
                      height={28}
                    />
                    {#if item.change_7d != null}
                      <span class="change" style:color={changeColor(item.change_7d)}>
                        {changePrefix(item.change_7d)}{item.change_7d.toFixed(1)}%
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .economy-view {
    animation: fade-in 0.3s ease-out;
  }

  .price-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .price-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color 0.15s;
  }

  .price-card:hover {
    border-color: var(--color-border-light);
  }

  .price-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
    flex: 1;
  }

  .item-icon {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
    image-rendering: pixelated;
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .item-name {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-rarity-legendary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-base {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: 2px;
  }

  .listings {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .price-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  .trend {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .change {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
</style>
