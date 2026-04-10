<!--
  @component
  Displays an equipped item with rarity-colored name and slot label.
  Uses PoE-specific rarity colors (Unique=brown/orange, Rare=yellow, Magic=blue, Normal=white).
-->
<script lang="ts">
  import { RARITY_COLORS } from "./colors";

  interface Props {
    /** Item name (e.g. "Shavronne's Wrappings") */
    name: string;
    /** Base item type (e.g. "Occultist's Vestment") */
    baseName?: string;
    /** PoE rarity: NORMAL, MAGIC, RARE, UNIQUE */
    rarity: string;
    /** Item type (e.g. "Body Armour") */
    type?: string;
    /** Equipment slot (e.g. "Body Armour", "Ring 1") */
    slot: string;
  }

  let { name, baseName, rarity, type, slot }: Props = $props();

  let color = $derived(RARITY_COLORS[rarity?.toUpperCase() as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.NORMAL);
</script>

<div class="item-slot">
  <span class="slot-label">{slot}</span>
  <div class="item-info">
    <span class="item-name" style:color>{name}</span>
    {#if baseName && baseName !== name}
      <span class="base-name">{baseName}</span>
    {/if}
  </div>
</div>

<style>
  .item-slot {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    padding: var(--space-xs) 0;
  }

  .slot-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    min-width: 90px;
    flex-shrink: 0;
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .item-name {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  .base-name {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
  }
</style>
