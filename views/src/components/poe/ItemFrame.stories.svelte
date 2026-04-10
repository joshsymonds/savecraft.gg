<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ItemFrame from "./ItemFrame.svelte";
  import StatLine from "./StatLine.svelte";
  import RequirementBar from "./RequirementBar.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/ItemFrame", tags: ["autodocs"] });

  const wrap = "padding: 24px; display: flex; flex-direction: column; gap: 20px; align-items: flex-start;";
</script>

<!-- Unique item: Kaom's Heart -->
<Story name="UniqueItem">
  <div style={wrap}>
    <ItemFrame name="Kaom's Heart" baseName="Glorious Plate" rarity="UNIQUE" itemType="Body Armour">
      {#snippet properties()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-dim);">
            Armour: <strong style="color: var(--color-text);">553</strong>
          </div>
        </div>
      {/snippet}
      {#snippet requirements()}
        <RequirementBar level={68} str={191} />
      {/snippet}
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="Has no Sockets" />
          <StatLine text="+500 to maximum Life" />
          <StatLine text="20% increased Fire Damage" />
        </div>
      {/snippet}
      {#snippet footer()}
        <em>The warrior who fears will fall.</em>
      {/snippet}
    </ItemFrame>
  </div>
</Story>

<!-- Rare item with implicit + explicit mods -->
<Story name="RareItem">
  <div style={wrap}>
    <ItemFrame name="Apocalypse Visor" baseName="Eternal Burgonet" rarity="RARE" itemType="Helmet">
      {#snippet properties()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-dim);">
            Armour: <strong style="color: var(--color-text);">812</strong>
          </div>
        </div>
      {/snippet}
      {#snippet requirements()}
        <RequirementBar level={69} str={138} />
      {/snippet}
      {#snippet implicits()}
        <StatLine text="+2 to Level of Socketed Minion Gems" variant="implicit" />
      {/snippet}
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="+98 to maximum Life" />
          <StatLine text="+42% to Fire Resistance" />
          <StatLine text="+38% to Lightning Resistance" />
          <StatLine text="Nearby Enemies have -9% to Fire Resistance" variant="crafted" />
        </div>
      {/snippet}
    </ItemFrame>
  </div>
</Story>

<!-- Magic item -->
<Story name="MagicItem">
  <div style={wrap}>
    <ItemFrame name="Sapphire Ring of Resistance" rarity="MAGIC" itemType="Ring">
      {#snippet implicits()}
        <StatLine text="+20% to Cold Resistance" variant="implicit" />
      {/snippet}
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="+34% to Lightning Resistance" />
        </div>
      {/snippet}
    </ItemFrame>
  </div>
</Story>

<!-- Normal item -->
<Story name="NormalItem">
  <div style={wrap}>
    <ItemFrame name="Simple Robe" rarity="NORMAL" itemType="Body Armour">
      {#snippet properties()}
        <div style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-dim);">
          Energy Shield: <strong style="color: var(--color-text);">15</strong>
        </div>
      {/snippet}
      {#snippet requirements()}
        <RequirementBar level={3} int={17} />
      {/snippet}
    </ItemFrame>
  </div>
</Story>

<!-- Skill Gem -->
<Story name="SkillGem">
  <div style={wrap}>
    <ItemFrame name="Spark" rarity="MAGIC" itemType="Skill Gem">
      {#snippet properties()}
        <div style="display: flex; flex-direction: column; gap: 2px; font-family: var(--font-body); font-size: 13px; color: var(--color-text-dim);">
          <div>Spell, Projectile, Lightning, Duration</div>
          <div>Level: <strong style="color: var(--color-text);">21</strong> (Max)</div>
          <div>Quality: <strong style="color: var(--color-text);">23%</strong></div>
          <div>Cast Time: <strong style="color: var(--color-text);">0.65 sec</strong></div>
          <div>Mana Cost: <strong style="color: var(--color-text);">12</strong></div>
        </div>
      {/snippet}
      {#snippet requirements()}
        <RequirementBar level={70} int={155} />
      {/snippet}
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="Deals 42 to 800 Lightning Damage" />
          <StatLine text="Fires 2 additional Projectiles" />
          <StatLine text="50% increased Projectile Speed" />
        </div>
      {/snippet}
    </ItemFrame>
  </div>
</Story>

<!-- All four rarities side by side -->
<Story name="AllRarities">
  <div style="padding: 24px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start;">
    <ItemFrame name="Iron Ring" rarity="NORMAL" itemType="Ring">
      {#snippet implicits()}
        <StatLine text="Adds 1 to 4 Physical Damage to Attacks" variant="implicit" />
      {/snippet}
    </ItemFrame>

    <ItemFrame name="Iron Ring of the Lynx" rarity="MAGIC" itemType="Ring">
      {#snippet implicits()}
        <StatLine text="Adds 1 to 4 Physical Damage to Attacks" variant="implicit" />
      {/snippet}
      {#snippet explicits()}
        <StatLine text="+18 to Dexterity" />
      {/snippet}
    </ItemFrame>

    <ItemFrame name="Brimstone Eye" baseName="Iron Ring" rarity="RARE" itemType="Ring">
      {#snippet implicits()}
        <StatLine text="Adds 1 to 4 Physical Damage to Attacks" variant="implicit" />
      {/snippet}
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="+42 to maximum Life" />
          <StatLine text="+36% to Fire Resistance" />
          <StatLine text="+28% to Cold Resistance" />
        </div>
      {/snippet}
    </ItemFrame>

    <ItemFrame name="Loreweave" baseName="Elegant Ringmail" rarity="UNIQUE" itemType="Body Armour">
      {#snippet explicits()}
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <StatLine text="Has 6 Sockets" />
          <StatLine text="+60 to maximum Life" />
          <StatLine text="+40 to maximum Energy Shield" />
          <StatLine text="+30% to all Elemental Resistances" />
          <StatLine text="Your Maximum Resistances are 78%" />
        </div>
      {/snippet}
      {#snippet footer()}
        <em>A token of their combined might.</em>
      {/snippet}
    </ItemFrame>
  </div>
</Story>
