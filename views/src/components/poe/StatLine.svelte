<!--
  @component
  A single formatted mod/stat line in PoE style.
  Values within the text are highlighted. Supports positive (blue), negative (red),
  and fire/cold/lightning/chaos damage coloring.

  Usage:
    <StatLine text="+500 to maximum Life" />
    <StatLine text="Adds 10 to 20 Physical Damage" />
    <StatLine text="-30% to Fire Resistance" />
-->
<script lang="ts">
  interface Props {
    /** The full stat text, e.g. "+500 to maximum Life" */
    text: string;
    /** Override color variant: "implicit" uses a muted gold, "enchant" uses cyan */
    variant?: "explicit" | "implicit" | "enchant" | "crafted" | "fractured";
  }

  let { text, variant = "explicit" }: Props = $props();

  /** Split text into segments: numeric values get highlighted, rest stays normal. */
  let segments = $derived.by(() => {
    const parts: Array<{ text: string; type: "text" | "value" }> = [];
    const regex = /([+-]?\d+(?:\.\d+)?%?(?:\s+to\s+[+-]?\d+(?:\.\d+)?%?)?)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), type: "text" });
      }
      parts.push({ text: match[0], type: "value" });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), type: "text" });
    }
    return parts.length > 0 ? parts : [{ text, type: "text" as const }];
  });

  const variantClass = $derived(variant);
</script>

<div class="stat-line {variantClass}">
  {#each segments as seg}
    {#if seg.type === "value"}
      <span class="value">{seg.text}</span>
    {:else}
      <span>{seg.text}</span>
    {/if}
  {/each}
</div>

<style>
  .stat-line {
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-info);
  }

  .stat-line.implicit {
    color: var(--color-gold);
  }

  .stat-line.enchant {
    color: #b4e4ff;
  }

  .stat-line.crafted {
    color: #b4b4ff;
  }

  .stat-line.fractured {
    color: #a29162;
  }

  .value {
    font-weight: 700;
    font-family: var(--font-heading);
  }
</style>
