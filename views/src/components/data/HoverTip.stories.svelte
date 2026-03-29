<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import HoverTip from "./HoverTip.svelte";
  import Tag from "./Tag.svelte";
  import Badge from "./Badge.svelte";

  const { Story } = defineMeta({
    title: "Data/HoverTip",
    tags: ["autodocs"],
  });
</script>

<Story name="PlainText">
  <div style="padding: 60px 40px 20px;">
    <HoverTip text="Compute drop probabilities for any item from any farmable source">
      <Tag label="Drop Calculator" color="var(--color-gold)" />
    </HoverTip>
  </div>
</Story>

<Story name="RichContent">
  <div style="padding: 80px 40px 20px;">
    <HoverTip>
      {#snippet tip()}
        <span style="display: block; font-family: var(--font-pixel); font-size: 8px; color: var(--color-gold); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
          Ask the AI to use this for
        </span>
        Contextual draft pick evaluation using 8-axis WASPAS scoring across 31 color archetypes
      {/snippet}
      <Tag label="Draft Advisor" color="var(--color-gold)" />
    </HoverTip>
  </div>
</Story>

<Story name="OnBadge">
  <div style="padding: 60px 40px 20px;">
    <HoverTip text="Data parsed from your actual save file, not player-written notes">
      <Badge label="Save Data" variant="positive" />
    </HoverTip>
  </div>
</Story>

<Story name="MultipleInRow">
  <div style="display: flex; gap: 8px; flex-wrap: wrap; padding: 80px 40px 20px;">
    <HoverTip text="Search the card database by name, colors, type, or oracle text">
      <Tag label="Card Search" color="var(--color-gold)" />
    </HoverTip>
    <HoverTip text="Browse 17Lands draft statistics for sets, cards, and archetypes">
      <Tag label="Card Stats" color="var(--color-gold)" />
    </HoverTip>
    <HoverTip text="Calculate wildcard cost to complete a target decklist">
      <Tag label="Collection Diff" color="var(--color-gold)" />
    </HoverTip>
  </div>
</Story>
