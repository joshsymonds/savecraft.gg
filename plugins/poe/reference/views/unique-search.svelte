<!--
  @component
  Unique item search results view. Shows matching uniques as ItemFrame cards
  with implicit/explicit mods, requirements, and optional pricing.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import EmptyState from "../../../../views/src/components/feedback/EmptyState.svelte";
  import ItemFrame from "../../../../views/src/components/poe/ItemFrame.svelte";
  import StatLine from "../../../../views/src/components/poe/StatLine.svelte";
  import RequirementBar from "../../../../views/src/components/poe/RequirementBar.svelte";
  import PriceTag from "../../../../views/src/components/poe/PriceTag.svelte";

  interface UniqueResult {
    name: string;
    base_type: string;
    item_class: string;
    level_requirement?: number;
    str_requirement?: number;
    dex_requirement?: number;
    int_requirement?: number;
    properties?: Array<{ label: string; value: string }>;
    implicit_mods?: string[];
    explicit_mods?: string[];
    flavour_text?: string;
    /** Economy data (optional — only present if economy module has data) */
    price?: { chaos?: number; divine?: number; confidence?: "high" | "low" };
  }

  interface Props {
    data: {
      icon_url?: string;
      query?: string;
      items: UniqueResult[];
    };
  }

  let { data }: Props = $props();
</script>

{#if data.items.length === 0}
  <EmptyState message="No unique items found" detail="Try a different search term or check the item name." />
{:else}
  <div class="unique-search">
    <Panel watermark={data.icon_url}>
      <Section title="Unique Items" subtitle="{data.items.length} found{data.query ? ` for "${data.query}"` : ''}">
        <div class="item-grid">
          {#each data.items as item}
            <div class="item-card">
              <ItemFrame
                name={item.name}
                baseName={item.base_type}
                rarity="UNIQUE"
                itemType={item.item_class}
              >
                {#snippet properties()}
                  {#if item.properties && item.properties.length > 0}
                    <div class="item-props">
                      {#each item.properties as prop}
                        <div class="prop-line">
                          {prop.label}: <strong>{prop.value}</strong>
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/snippet}

                {#snippet requirements()}
                  <RequirementBar
                    level={item.level_requirement}
                    str={item.str_requirement}
                    dex={item.dex_requirement}
                    int={item.int_requirement}
                  />
                {/snippet}

                {#if item.implicit_mods && item.implicit_mods.length > 0}
                  {#snippet implicits()}
                    {#each item.implicit_mods as mod}
                      <StatLine text={mod} variant="implicit" />
                    {/each}
                  {/snippet}
                {/if}

                {#if item.explicit_mods && item.explicit_mods.length > 0}
                  {#snippet explicits()}
                    <div class="mod-list">
                      {#each item.explicit_mods as mod}
                        <StatLine text={mod} />
                      {/each}
                    </div>
                  {/snippet}
                {/if}

                {#if item.flavour_text}
                  {#snippet footer()}
                    <em>{item.flavour_text}</em>
                  {/snippet}
                {/if}
              </ItemFrame>

              {#if item.price}
                <div class="price-row">
                  <PriceTag
                    chaos={item.price.chaos}
                    divine={item.price.divine}
                    confidence={item.price.confidence}
                    compact
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </Section>
    </Panel>
  </div>
{/if}

<style>
  .unique-search {
    animation: fade-in 0.3s ease-out;
  }

  .item-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .item-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .item-props {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .prop-line {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  .prop-line strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .mod-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .price-row {
    padding: 0 var(--space-lg);
  }
</style>
