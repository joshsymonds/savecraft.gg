<!--
  @component
  Renders MTG oracle text with ability separation and inline mana symbols.
  Splits on newlines into distinct ability blocks with subtle separators.
  Parses {W}, {2}, {W/U} etc. tokens into inline ManaPip components.
-->
<script lang="ts">
  import ManaPip from "./ManaPip.svelte";

  interface Props {
    /** Raw oracle text string, e.g. "Deathtouch\nDeal {2}{R} damage." */
    text: string;
  }

  let { text }: Props = $props();

  type Segment = { type: "text"; value: string } | { type: "pip"; symbol: string };

  function parseAbility(raw: string): Segment[] {
    const segments: Segment[] = [];
    let remaining = raw;
    while (remaining.length > 0) {
      const idx = remaining.indexOf("{");
      if (idx === -1) {
        segments.push({ type: "text", value: remaining });
        break;
      }
      if (idx > 0) {
        segments.push({ type: "text", value: remaining.slice(0, idx) });
      }
      const end = remaining.indexOf("}", idx);
      if (end === -1) {
        segments.push({ type: "text", value: remaining.slice(idx) });
        break;
      }
      segments.push({ type: "pip", symbol: remaining.slice(idx + 1, end) });
      remaining = remaining.slice(end + 1);
    }
    return segments;
  }

  let abilities = $derived.by(() => {
    if (!text) return [];
    return text.split("\n").filter((line) => line.length > 0);
  });

  let parsed = $derived(abilities.map(parseAbility));
</script>

{#if parsed.length > 0}
  <div class="oracle-text">
    {#each parsed as segments, i}
      {#if i > 0}
        <div class="ability-separator"></div>
      {/if}
      <p class="ability">
        {#each segments as seg}
          {#if seg.type === "text"}
            {seg.value}
          {:else}
            <ManaPip symbol={seg.symbol} size="sm" />
          {/if}
        {/each}
      </p>
    {/each}
  </div>
{/if}

<style>
  .oracle-text {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .ability {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--color-text-dim);
    line-height: 1.5;
    padding: var(--space-xs) 0;
  }

  .ability-separator {
    height: 1px;
    background: color-mix(in srgb, var(--color-border) 20%, transparent);
  }
</style>
