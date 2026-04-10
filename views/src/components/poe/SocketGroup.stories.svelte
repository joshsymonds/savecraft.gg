<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SocketGroup from "./SocketGroup.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/SocketGroup", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- Main 6-link setup -->
<Story name="MainSkillGroup">
  <div style="{wrap} width: 600px;">
    <SocketGroup
      label="Vaal Spark"
      slot="Body Armour"
      isMainGroup
      gems={[
        { name: "Vaal Spark", level: 21, quality: 23, color: "B", socketColor: "B", vaal: true, tags: "Vaal, Spell, Projectile, Duration, Lightning", description: "Launches unpredictable ones of ethereal lightning at nearby enemies.", castTime: 0.65, reqInt: 155, naturalMaxLevel: 20 },
        { name: "Spell Echo Support", level: 21, quality: 20, support: true, color: "B", socketColor: "B", tags: "Support, Spell, Duration", description: "Supported skills repeat an additional time.", reqInt: 111, naturalMaxLevel: 20 },
        { name: "Increased Critical Strikes Support", level: 20, quality: 20, support: true, color: "B", socketColor: "B", tags: "Support, Critical", reqInt: 111, naturalMaxLevel: 20 },
        { name: "Lightning Penetration Support", level: 21, quality: 20, support: true, color: "B", socketColor: "B", tags: "Support, Lightning", reqInt: 111, naturalMaxLevel: 20 },
        { name: "Inspiration Support", level: 20, quality: 20, support: true, color: "B", socketColor: "B", tags: "Support", reqInt: 111, naturalMaxLevel: 20 },
        { name: "Awakened Added Lightning Damage Support", level: 5, quality: 20, support: true, color: "B", socketColor: "B", tags: "Support, Lightning", reqInt: 111, naturalMaxLevel: 5 },
      ]}
    />
  </div>
</Story>

<!-- Secondary setup (auras) -->
<Story name="AuraGroup">
  <div style="{wrap} width: 500px;">
    <SocketGroup
      label="Auras"
      slot="Helmet"
      gems={[
        { name: "Wrath", level: 21, quality: 23, color: "B", socketColor: "B", tags: "Spell, AoE, Lightning, Aura", hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20 },
        { name: "Zealotry", level: 21, quality: 20, color: "B", socketColor: "B", tags: "Spell, AoE, Aura", hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20 },
        { name: "Enlighten Support", level: 4, support: true, color: "W", socketColor: "W", tags: "Support", reqStr: 73, naturalMaxLevel: 5 },
      ]}
    />
  </div>
</Story>

<!-- Mixed attribute gems -->
<Story name="MixedAttributes">
  <div style="{wrap} width: 500px;">
    <SocketGroup
      label="Movement"
      slot="Boots"
      gems={[
        { name: "Shield Charge", level: 1, color: "R", socketColor: "R", tags: "Attack, AoE, Movement", castTime: 1.0, reqStr: 14, naturalMaxLevel: 20 },
        { name: "Faster Attacks Support", level: 20, quality: 20, support: true, color: "G", socketColor: "G", tags: "Support, Attack", reqDex: 111, naturalMaxLevel: 20 },
        { name: "Fortify Support", level: 20, quality: 20, support: true, color: "R", socketColor: "R", tags: "Support, Attack, Melee", reqStr: 111, naturalMaxLevel: 20 },
      ]}
    />
  </div>
</Story>

<!-- Disabled group -->
<Story name="DisabledGroup">
  <div style="{wrap} width: 500px;">
    <SocketGroup
      label="Disabled Setup"
      slot="Weapon Swap"
      enabled={false}
      gems={[
        { name: "Vaal Grace", level: 21, quality: 20, color: "G", socketColor: "G", tags: "Vaal, Spell, AoE, Duration, Aura" },
        { name: "Increased Duration Support", level: 20, quality: 20, support: true, color: "R", socketColor: "R", tags: "Support, Duration" },
      ]}
    />
  </div>
</Story>

<!-- With some disabled individual gems -->
<Story name="PartiallyDisabledGems">
  <div style="{wrap} width: 500px;">
    <SocketGroup
      label="CWDT Setup"
      slot="Gloves"
      gems={[
        { name: "Cast when Damage Taken Support", level: 2, quality: 0, support: true, color: "R", socketColor: "R", tags: "Support, Spell" },
        { name: "Immortal Call", level: 4, quality: 20, color: "R", socketColor: "R", tags: "Spell, Duration" },
        { name: "Increased Duration Support", level: 20, quality: 20, support: true, color: "R", socketColor: "R", tags: "Support, Duration" },
        { name: "Molten Shell", level: 20, quality: 20, color: "R", socketColor: "R", tags: "Spell, AoE, Duration, Guard", enabled: false },
      ]}
    />
  </div>
</Story>

<!-- Multiple groups together -->
<Story name="MultipleGroups">
  <div style="{wrap} width: 600px; display: flex; flex-direction: column; gap: 12px;">
    <SocketGroup
      label="Vaal Spark"
      slot="Body Armour"
      isMainGroup
      gems={[
        { name: "Vaal Spark", level: 21, quality: 23, color: "B", socketColor: "B", vaal: true, tags: "Vaal, Spell, Projectile, Duration, Lightning" },
        { name: "Spell Echo Support", level: 21, quality: 20, support: true, color: "B", socketColor: "B" },
        { name: "Inspiration Support", level: 20, quality: 20, support: true, color: "B", socketColor: "B" },
      ]}
    />
    <SocketGroup
      label="Auras"
      slot="Helmet"
      gems={[
        { name: "Wrath", level: 21, quality: 23, color: "B", socketColor: "B", hasGlobalEffect: true },
        { name: "Zealotry", level: 21, quality: 20, color: "B", socketColor: "B", hasGlobalEffect: true },
      ]}
    />
    <SocketGroup
      label="Movement"
      slot="Boots"
      gems={[
        { name: "Shield Charge", level: 1, color: "R", socketColor: "R" },
        { name: "Faster Attacks Support", level: 20, quality: 20, support: true, color: "G", socketColor: "G" },
      ]}
    />
  </div>
</Story>
