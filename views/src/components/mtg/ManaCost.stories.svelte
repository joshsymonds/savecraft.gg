<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ManaCost from "./ManaCost.svelte";
  const { Story } = defineMeta({ title: "MTG/Components/ManaCost", tags: ["autodocs"] });

  const costs = {
    simple: "{R}",
    multi: "{2}{W}{B}",
    expensive: "{8}{U}{U}{U}",
    hybrid: "{2}{W/U}{W/U}",
    phyrexian: "{W/P}{W/P}{U}",
    xSpell: "{X}{R}{R}",
    fourColor: "{3}{W}{U}{B}",
  };
</script>

<Story name="SimpleCost">
  <ManaCost cost={costs.simple} />
</Story>

<Story name="MultiColor">
  <ManaCost cost={costs.multi} />
</Story>

<Story name="Expensive">
  <ManaCost cost={costs.expensive} />
</Story>

<Story name="HybridCost">
  <ManaCost cost={costs.hybrid} />
</Story>

<Story name="PhyrexianCost">
  <ManaCost cost={costs.phyrexian} />
</Story>

<Story name="XSpell">
  <ManaCost cost={costs.xSpell} />
</Story>

<Story name="SizeComparison">
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; width: 24px;">sm</span>
      <ManaCost cost={costs.fourColor} size="sm" />
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; width: 24px;">md</span>
      <ManaCost cost={costs.fourColor} size="md" />
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="color: var(--color-text-muted); font-family: var(--font-body); font-size: 12px; width: 24px;">lg</span>
      <ManaCost cost={costs.fourColor} size="lg" />
    </div>
  </div>
</Story>

<Story name="Empty">
  <div style="color: var(--color-text-muted); font-family: var(--font-body);">
    Empty cost (should render nothing): [<ManaCost cost="" />]
  </div>
</Story>
