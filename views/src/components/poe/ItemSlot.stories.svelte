<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ItemSlot from "./ItemSlot.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/ItemSlot", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- Unique items -->
<Story name="UniqueItems">
  <div style="{wrap} width: 500px; display: flex; flex-direction: column;">
    <ItemSlot slot="Body Armour" name="Shavronne's Wrappings" baseName="Occultist's Vestment" rarity="UNIQUE" type="Body Armour" />
    <ItemSlot slot="Helmet" name="Crown of the Inward Eye" baseName="Prophet Crown" rarity="UNIQUE" type="Helmet" />
    <ItemSlot slot="Weapon 1" name="Void Battery" baseName="Prophecy Wand" rarity="UNIQUE" type="Wand" />
    <ItemSlot slot="Shield" name="Prism Guardian" baseName="Archon Kite Shield" rarity="UNIQUE" type="Shield" />
  </div>
</Story>

<!-- Rare items -->
<Story name="RareItems">
  <div style="{wrap} width: 500px; display: flex; flex-direction: column;">
    <ItemSlot slot="Ring 1" name="Hypnotic Loop" baseName="Opal Ring" rarity="RARE" type="Ring" />
    <ItemSlot slot="Ring 2" name="Dusk Coil" baseName="Vermillion Ring" rarity="RARE" type="Ring" />
    <ItemSlot slot="Amulet" name="Soul Locket" baseName="Citrine Amulet" rarity="RARE" type="Amulet" />
    <ItemSlot slot="Belt" name="Armageddon Bind" baseName="Crystal Belt" rarity="RARE" type="Belt" />
  </div>
</Story>

<!-- All rarity tiers -->
<Story name="AllRarities">
  <div style="{wrap} width: 500px; display: flex; flex-direction: column;">
    <ItemSlot slot="Body Armour" name="Shavronne's Wrappings" baseName="Occultist's Vestment" rarity="UNIQUE" />
    <ItemSlot slot="Gloves" name="Storm Fingers" baseName="Sorcerer Gloves" rarity="RARE" />
    <ItemSlot slot="Boots" name="Gale Trail" baseName="Sorcerer Boots" rarity="MAGIC" />
    <ItemSlot slot="Flask 1" name="Quicksilver Flask" rarity="NORMAL" />
  </div>
</Story>

<!-- Items without base names -->
<Story name="NoBaseName">
  <div style="{wrap} width: 500px; display: flex; flex-direction: column;">
    <ItemSlot slot="Flask 1" name="Divine Life Flask" rarity="MAGIC" />
    <ItemSlot slot="Flask 2" name="Quicksilver Flask" rarity="NORMAL" />
    <ItemSlot slot="Jewel 1" name="Watcher's Eye" rarity="UNIQUE" />
  </div>
</Story>
