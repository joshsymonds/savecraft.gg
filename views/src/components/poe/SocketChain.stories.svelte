<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SocketChain from "./SocketChain.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/SocketChain", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 24px; border-radius: 8px;";

  // Full 6-link Vaal Spark setup with rich tooltip data
  const sixLink = [
    {
      name: "Vaal Spark", color: "B", socketColor: "B",
      level: 21, quality: 23, vaal: true,
      tags: "Vaal, Spell, Projectile, Duration, Lightning",
      description: "Launches unpredictable ones of ethereal lightning at nearby enemies.",
      castTime: 0.65, reqInt: 155, naturalMaxLevel: 20,
    },
    {
      name: "Spell Echo", color: "B", socketColor: "B", support: true,
      level: 21, quality: 20,
      tags: "Support, Spell, Duration",
      description: "Supported skills repeat an additional time.",
      reqInt: 111, naturalMaxLevel: 20,
    },
    {
      name: "Inc Crit Strikes", color: "B", socketColor: "B", support: true,
      level: 20, quality: 20,
      tags: "Support, Critical",
      description: "Supported skills have increased critical strike chance.",
      reqInt: 111, naturalMaxLevel: 20,
    },
    {
      name: "Lightning Pen", color: "B", socketColor: "B", support: true,
      level: 21, quality: 20,
      tags: "Support, Lightning",
      description: "Supported skills penetrate enemy lightning resistance.",
      reqInt: 111, naturalMaxLevel: 20,
    },
    {
      name: "Inspiration", color: "B", socketColor: "B", support: true,
      level: 20, quality: 20,
      tags: "Support",
      description: "Supported skills cost less mana and have increased critical strike chance and elemental damage per inspiration charge.",
      reqInt: 111, naturalMaxLevel: 20,
    },
    {
      name: "Awak Added Ltng", color: "B", socketColor: "B", support: true,
      level: 5, quality: 20,
      tags: "Support, Lightning",
      description: "Adds lightning damage to supported skills.",
      reqInt: 111, naturalMaxLevel: 5,
    },
  ];

  // Mixed color 3-link in boots
  const threeLink = [
    {
      name: "Shield Charge", color: "R", socketColor: "R",
      level: 1, tags: "Attack, AoE, Movement",
      description: "Charges at a targeted location or enemy, pushing away enemies and dealing damage in an area.",
      castTime: 1.0, reqStr: 14, naturalMaxLevel: 20,
    },
    {
      name: "Faster Attacks", color: "G", socketColor: "G", support: true,
      level: 20, quality: 20,
      tags: "Support, Attack",
      description: "Supported skills have increased attack speed.",
      reqDex: 111, naturalMaxLevel: 20,
    },
    {
      name: "Fortify", color: "R", socketColor: "R", support: true,
      level: 20, quality: 20,
      tags: "Support, Attack, Melee",
      description: "Supported skills grant fortification on melee hit.",
      reqStr: 111, naturalMaxLevel: 20,
    },
  ];

  // Aura setup
  const auras = [
    {
      name: "Wrath", color: "B", socketColor: "B",
      level: 21, quality: 23,
      tags: "Spell, AoE, Lightning, Aura",
      description: "Casts an aura that grants lightning damage to you and your allies.",
      hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20,
    },
    {
      name: "Zealotry", color: "B", socketColor: "B",
      level: 21, quality: 20,
      tags: "Spell, AoE, Aura",
      description: "Casts an aura that grants spell damage and spell critical strike chance to you and your allies.",
      hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20,
    },
    {
      name: "Enlighten", color: "W", socketColor: "W", support: true,
      level: 4, quality: 0,
      tags: "Support",
      reqStr: 73, naturalMaxLevel: 5,
    },
  ];

  // With a disabled gem
  const withDisabled = [
    { name: "CWDT", color: "R", socketColor: "R", support: true, level: 2, tags: "Support, Spell" },
    { name: "Immortal Call", color: "R", socketColor: "R", level: 4, quality: 20, tags: "Spell, Duration" },
    { name: "Inc Duration", color: "R", socketColor: "R", support: true, level: 20, quality: 20, tags: "Support, Duration" },
    { name: "Molten Shell", color: "R", socketColor: "R", level: 20, quality: 20, tags: "Spell, AoE, Duration, Guard", enabled: false },
  ];
</script>

<!-- Full 6-link main skill -->
<Story name="SixLink">
  <div style="{wrap} width: 600px;">
    <SocketChain gems={sixLink} isMainGroup />
  </div>
</Story>

<!-- 3-link mixed colors -->
<Story name="ThreeLink">
  <div style="{wrap} width: 400px;">
    <SocketChain gems={threeLink} />
  </div>
</Story>

<!-- Aura setup with Enlighten -->
<Story name="AuraSetup">
  <div style="{wrap} width: 400px;">
    <SocketChain gems={auras} />
  </div>
</Story>

<!-- Group with disabled gem -->
<Story name="WithDisabledGem">
  <div style="{wrap} width: 450px;">
    <SocketChain gems={withDisabled} />
  </div>
</Story>

<!-- Disabled entire group -->
<Story name="DisabledGroup">
  <div style="{wrap} width: 600px;">
    <SocketChain gems={sixLink} enabled={false} />
  </div>
</Story>

<!-- Multiple groups stacked (as they'd appear in the view) -->
<Story name="MultipleGroups">
  <div style="{wrap} width: 600px; display: flex; flex-direction: column; gap: 20px;">
    <div>
      <div style="font-family: var(--font-heading); font-size: 13px; color: var(--color-text-dim); margin-bottom: 4px;">Vaal Spark — Body Armour</div>
      <SocketChain gems={sixLink} isMainGroup />
    </div>
    <div>
      <div style="font-family: var(--font-heading); font-size: 13px; color: var(--color-text-dim); margin-bottom: 4px;">Auras — Helmet</div>
      <SocketChain gems={auras} />
    </div>
    <div>
      <div style="font-family: var(--font-heading); font-size: 13px; color: var(--color-text-dim); margin-bottom: 4px;">Movement — Boots</div>
      <SocketChain gems={threeLink} />
    </div>
    <div>
      <div style="font-family: var(--font-heading); font-size: 13px; color: var(--color-text-dim); margin-bottom: 4px;">CWDT — Gloves</div>
      <SocketChain gems={withDisabled} />
    </div>
  </div>
</Story>
