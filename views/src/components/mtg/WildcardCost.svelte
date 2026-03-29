<!--
  @component
  Rarity-colored wildcard cost summary.
  Shows how many wildcards of each rarity are needed, with a total.
-->
<script lang="ts">
  import Badge from "../data/Badge.svelte";

  interface WildcardCostData {
    common: number;
    uncommon: number;
    rare: number;
    mythic: number;
    unknown: number;
    total: number;
  }

  interface Props {
    cost: WildcardCostData;
  }

  let { cost }: Props = $props();

  const RARITIES: { key: keyof WildcardCostData; label: string; variant: string }[] = [
    { key: "mythic", label: "mythic", variant: "legendary" },
    { key: "rare", label: "rare", variant: "rare" },
    { key: "uncommon", label: "uncommon", variant: "uncommon" },
    { key: "common", label: "common", variant: "common" },
  ];
</script>

<div class="wildcard-cost">
  <span class="total">{cost.total} wildcards needed</span>
  <div class="breakdown">
    {#each RARITIES as r}
      {#if cost[r.key] > 0}
        <Badge label="{cost[r.key]} {r.label}" variant={r.variant} />
      {/if}
    {/each}
  </div>
</div>

<style>
  .wildcard-cost {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .total {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 700;
    color: var(--color-text);
  }

  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
</style>
