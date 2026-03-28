<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Badge from "./Badge.svelte";

  const { Story } = defineMeta({
    title: "Components/Data/Badge",
    tags: ["autodocs"],
  });
</script>

<Story name="AllVariants">
  <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
    <div>
      <p style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">Rarity Tiers</p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <Badge label="Legendary" variant="legendary" />
        <Badge label="Epic" variant="epic" />
        <Badge label="Rare" variant="rare" />
        <Badge label="Uncommon" variant="uncommon" />
        <Badge label="Common" variant="common" />
        <Badge label="Poor" variant="poor" />
      </div>
    </div>
    <div>
      <p style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">Semantic</p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <Badge label="Synced" variant="positive" />
        <Badge label="Error" variant="negative" />
        <Badge label="Featured" variant="highlight" />
        <Badge label="New" variant="info" />
        <Badge label="Needs Setup" variant="warning" />
        <Badge label="Archived" variant="muted" />
      </div>
    </div>
  </div>
</Story>

<Story name="InContext">
  <div style="display: flex; align-items: baseline; gap: 10px; padding: 20px;">
    <span style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text);">Sheoldred, the Apocalypse</span>
    <Badge label="Mythic" variant="legendary" />
  </div>
</Story>
