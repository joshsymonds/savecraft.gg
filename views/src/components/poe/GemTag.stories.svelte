<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import GemTag from "./GemTag.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/GemTag", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- Active skill gems by attribute -->
<Story name="ActiveGems">
  <div style="{wrap} display: flex; flex-direction: column; gap: 8px;">
    <GemTag name="Spark" color="B" level={21} quality={20} />
    <GemTag name="Molten Strike" color="R" level={20} quality={20} />
    <GemTag name="Tornado Shot" color="G" level={21} quality={23} />
    <GemTag name="Portal" color="W" level={1} />
  </div>
</Story>

<!-- Support gems -->
<Story name="SupportGems">
  <div style="{wrap} display: flex; flex-direction: column; gap: 8px;">
    <GemTag name="Spell Echo Support" color="B" support level={21} quality={20} />
    <GemTag name="Multistrike Support" color="R" support level={20} quality={20} />
    <GemTag name="Greater Multiple Projectiles Support" color="G" support level={21} quality={20} />
    <GemTag name="Empower Support" color="W" support level={4} />
  </div>
</Story>

<!-- Disabled gems -->
<Story name="DisabledGems">
  <div style="{wrap} display: flex; flex-direction: column; gap: 8px;">
    <GemTag name="Vaal Spark" color="B" level={21} quality={20} enabled={false} />
    <GemTag name="Increased Duration Support" color="R" support level={20} quality={20} enabled={false} />
  </div>
</Story>

<!-- No level/quality (minimal) -->
<Story name="NameOnly">
  <div style="{wrap} display: flex; flex-direction: column; gap: 8px;">
    <GemTag name="Spark" color="B" />
    <GemTag name="Added Lightning Damage Support" color="B" support />
    <GemTag name="Unknown Gem" />
  </div>
</Story>
