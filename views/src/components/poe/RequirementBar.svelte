<!--
  @component
  Horizontal bar showing item/gem requirements: Level, Str, Dex, Int.
  Attribute values are colored using the PoE attribute palette.
  Only shows requirements that have a non-zero value.

  Usage:
    <RequirementBar level={68} str={155} int={68} />
-->
<script lang="ts">
  import { GEM_COLORS } from "./colors";

  interface Props {
    /** Level requirement */
    level?: number;
    /** Strength requirement */
    str?: number;
    /** Dexterity requirement */
    dex?: number;
    /** Intelligence requirement */
    int?: number;
  }

  let { level, str, dex, int }: Props = $props();

  let reqs = $derived.by(() => {
    const items: Array<{ label: string; value: number; color: string }> = [];
    if (level && level > 0) items.push({ label: "Level", value: level, color: "var(--color-text)" });
    if (str && str > 0) items.push({ label: "Str", value: str, color: GEM_COLORS.str.glow });
    if (dex && dex > 0) items.push({ label: "Dex", value: dex, color: GEM_COLORS.dex.glow });
    if (int && int > 0) items.push({ label: "Int", value: int, color: GEM_COLORS.int.glow });
    return items;
  });

  let hasReqs = $derived(reqs.length > 0);
</script>

{#if hasReqs}
  <div class="requirement-bar">
    <span class="label">Requires</span>
    {#each reqs as req, i}
      {#if i > 0}<span class="sep">,</span>{/if}
      <span class="req">
        <span class="req-label">{req.label}</span>
        <span class="req-value" style:color={req.color}>{req.value}</span>
      </span>
    {/each}
  </div>
{/if}

<style>
  .requirement-bar {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    flex-wrap: wrap;
  }

  .label {
    color: var(--color-text-muted);
    margin-right: 2px;
  }

  .sep {
    color: var(--color-text-muted);
  }

  .req {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
  }

  .req-label {
    color: var(--color-text-muted);
  }

  .req-value {
    font-weight: 700;
    font-family: var(--font-heading);
  }
</style>
