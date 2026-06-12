<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Verdict from "./Verdict.svelte";
  import Panel from "../layout/Panel.svelte";

  const { Story } = defineMeta({ title: "Data/Verdict", tags: ["autodocs"] });

  const wrap = "width: 560px;";
</script>

<!-- Numeric verdict: counts up, S-tier stamp -->
<Story name="TimeToDrop">
  <div style={wrap}>
    <Panel accent="var(--color-gold)">
      <Verdict
        value="~134 runs"
        caption="Expected Time to Drop"
        sub="Mephisto (Hell) — best source for your 412% MF"
        stamp="S"
      />
    </Panel>
  </div>
</Story>

<!-- Phrase verdict with multi-char stamp -->
<Story name="PickQuality">
  <div style={wrap}>
    <Panel accent="var(--color-rarity-epic)">
      <Verdict
        value="Solid Pick"
        caption="P2P7 — Sphinx of Forgotten Lore"
        sub="Best in Dimir, replaceable in your Azorius lane"
        stamp="B+"
        variant="epic"
      />
    </Panel>
  </div>
</Story>

<!-- Negative verdict -->
<Story name="FactoryStalled">
  <div style={wrap}>
    <Panel accent="var(--color-negative)">
      <Verdict
        value="Factory Stalled"
        caption="3 Critical Bottlenecks"
        sub="Steel plate starvation cascades to 4 product lines"
        stamp="!"
        variant="negative"
      />
    </Panel>
  </div>
</Story>

<!-- No stamp -->
<Story name="NoStamp">
  <div style={wrap}>
    <Panel accent="var(--color-positive)">
      <Verdict
        value="94.2%"
        caption="Surgery Success Chance"
        sub="Bionic arm installation — glitterworld medicine, hospital bed"
        variant="positive"
      />
    </Panel>
  </div>
</Story>

<!-- Long value wraps without breaking layout -->
<Story name="LongValue">
  <div style={wrap}>
    <Panel accent="var(--color-info)">
      <Verdict
        value="Advanced Asteroid Processing"
        caption="Recommended Research"
        sub="Unlocks all three blocked thruster product lines"
        stamp="R"
        variant="info"
      />
    </Panel>
  </div>
</Story>
