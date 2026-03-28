<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/Panel",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 400px;">
    <Panel>
      <p style="font-family: var(--font-heading); font-size: 18px; font-weight: 600; color: var(--color-gold); margin-bottom: 8px;">
        Diablo II: Resurrected
      </p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">
        Hammerdin — Level 92 Paladin
      </p>
    </Panel>
  </div>
</Story>

<Story name="WithAccent">
  <div style="display: flex; flex-direction: column; gap: 12px; width: 400px;">
    <Panel accent="var(--color-rarity-legendary)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-legendary);">Legendary Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Windforce — Hydra Bow</p>
    </Panel>
    <Panel accent="var(--color-rarity-epic)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-epic);">Epic Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Tal Rasha's Guardianship</p>
    </Panel>
    <Panel accent="var(--color-rarity-rare)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-rare);">Rare Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Storm Gyre — Bone Ring</p>
    </Panel>
    <Panel accent="var(--color-negative)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-negative);">Error State</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Connection to daemon lost</p>
    </Panel>
  </div>
</Story>

<Story name="CompactPadding">
  <div style="width: 300px;">
    <Panel padding="var(--space-sm)">
      <p style="font-family: var(--font-body); font-size: 13px; color: var(--color-text);">
        Compact panel for inline elements like badges or stat rows.
      </p>
    </Panel>
  </div>
</Story>
