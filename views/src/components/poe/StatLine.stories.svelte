<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import StatLine from "./StatLine.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/StatLine", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- Explicit mods (default blue) -->
<Story name="ExplicitMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="+500 to maximum Life" />
    <StatLine text="Adds 10 to 20 Physical Damage" />
    <StatLine text="+46% to Fire Resistance" />
    <StatLine text="30% increased Attack Speed" />
    <StatLine text="Regenerate 3.5% of Life per second" />
    <StatLine text="-30% to maximum Energy Shield" />
  </div>
</Story>

<!-- Implicit mods (gold) -->
<Story name="ImplicitMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="+12% to all Elemental Resistances" variant="implicit" />
    <StatLine text="+16 to maximum Life" variant="implicit" />
    <StatLine text="6% increased Attack Speed" variant="implicit" />
  </div>
</Story>

<!-- Crafted mods (blue-purple) -->
<Story name="CraftedMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="+25% to Cold Resistance" variant="crafted" />
    <StatLine text="Can have up to 3 Crafted Modifiers" variant="crafted" />
    <StatLine text="Adds 1 to 16 Lightning Damage to Attacks" variant="crafted" />
  </div>
</Story>

<!-- Enchant mods (cyan) -->
<Story name="EnchantMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="40% increased Spark Damage" variant="enchant" />
    <StatLine text="Spark fires 2 additional Projectiles" variant="enchant" />
  </div>
</Story>

<!-- Fractured mods (brown-gold) -->
<Story name="FracturedMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="+120 to maximum Life" variant="fractured" />
    <StatLine text="+40% to Cold Resistance" variant="fractured" />
  </div>
</Story>

<!-- Mixed display (typical item) -->
<Story name="MixedItemMods">
  <div style="{wrap} display: flex; flex-direction: column; gap: 4px;">
    <StatLine text="+12% to all Elemental Resistances" variant="implicit" />
    <div style="border-top: 1px solid var(--color-border); margin: 4px 0;"></div>
    <StatLine text="+500 to maximum Life" />
    <StatLine text="10% increased maximum Energy Shield" />
    <StatLine text="+46% to Fire Resistance" />
    <StatLine text="+40% to Cold Resistance" variant="fractured" />
    <StatLine text="+25% to Lightning Resistance" variant="crafted" />
  </div>
</Story>
