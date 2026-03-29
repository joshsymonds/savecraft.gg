<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ManaPip from "./ManaPip.svelte";
  const { Story } = defineMeta({ title: "MTG/ManaPip", tags: ["autodocs"] });
</script>

<!-- All five colors + colorless -->
<Story name="AllColors">
  <div style="display: flex; gap: 8px; align-items: center;">
    <ManaPip symbol="W" />
    <ManaPip symbol="U" />
    <ManaPip symbol="B" />
    <ManaPip symbol="R" />
    <ManaPip symbol="G" />
    <ManaPip symbol="C" />
  </div>
</Story>

<!-- Generic mana numbers -->
<Story name="Numbers">
  <div style="display: flex; gap: 8px; align-items: center;">
    <ManaPip symbol="0" />
    <ManaPip symbol="1" />
    <ManaPip symbol="2" />
    <ManaPip symbol="5" />
    <ManaPip symbol="10" />
    <ManaPip symbol="X" />
  </div>
</Story>

<!-- Hybrid mana (split circle) -->
<Story name="Hybrid">
  <div style="display: flex; gap: 8px; align-items: center;">
    <ManaPip symbol="W/U" />
    <ManaPip symbol="U/B" />
    <ManaPip symbol="B/R" />
    <ManaPip symbol="R/G" />
    <ManaPip symbol="G/W" />
    <ManaPip symbol="W/B" />
    <ManaPip symbol="U/R" />
    <ManaPip symbol="B/G" />
    <ManaPip symbol="R/W" />
    <ManaPip symbol="G/U" />
  </div>
</Story>

<!-- Phyrexian mana -->
<Story name="Phyrexian">
  <div style="display: flex; gap: 8px; align-items: center;">
    <ManaPip symbol="W/P" />
    <ManaPip symbol="U/P" />
    <ManaPip symbol="B/P" />
    <ManaPip symbol="R/P" />
    <ManaPip symbol="G/P" />
    <ManaPip symbol="P" />
  </div>
</Story>

<!-- Size comparison -->
<Story name="Sizes">
  <div style="display: flex; gap: 16px; align-items: center;">
    <div style="display: flex; gap: 4px; align-items: center;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; margin-right: 4px;">sm</span>
      <ManaPip symbol="W" size="sm" />
      <ManaPip symbol="U" size="sm" />
      <ManaPip symbol="B" size="sm" />
      <ManaPip symbol="R" size="sm" />
      <ManaPip symbol="G" size="sm" />
    </div>
    <div style="display: flex; gap: 4px; align-items: center;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; margin-right: 4px;">md</span>
      <ManaPip symbol="W" size="md" />
      <ManaPip symbol="U" size="md" />
      <ManaPip symbol="B" size="md" />
      <ManaPip symbol="R" size="md" />
      <ManaPip symbol="G" size="md" />
    </div>
    <div style="display: flex; gap: 4px; align-items: center;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; margin-right: 4px;">lg</span>
      <ManaPip symbol="W" size="lg" />
      <ManaPip symbol="U" size="lg" />
      <ManaPip symbol="B" size="lg" />
      <ManaPip symbol="R" size="lg" />
      <ManaPip symbol="G" size="lg" />
    </div>
  </div>
</Story>

<!-- Mixed: a realistic mana cost shown as individual pips -->
<Story name="RealisticMix">
  <div style="display: flex; gap: 4px; align-items: center;">
    <ManaPip symbol="3" />
    <ManaPip symbol="W" />
    <ManaPip symbol="U" />
    <ManaPip symbol="B" />
  </div>
</Story>
