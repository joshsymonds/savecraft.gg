<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import BuildPlanner from "./build-planner.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/BuildPlanner", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  // Full Vaal Spark Occultist build with all sections
  const fullBuild = {
    icon_url: iconUrl,
    buildId: "abc123",
    data: {
      character: {
        class: "Witch",
        ascendancy: "Occultist",
        level: 95,
      },
      summary: {
        CombinedDPS: 1_247_832,
        TotalDPS: 1_247_832,
        Life: 4_891,
        EnergyShield: 2_104,
        Mana: 847,
        Armour: 1_240,
        Evasion: 0,
        FireResist: 75,
        ColdResist: 75,
        LightningResist: 76,
        ChaosResist: -30,
        BlockChance: 42,
        SpellSuppressionChance: 0,
        MovementSpeedMod: 1.3,
        Str: 89,
        Dex: 102,
        Int: 312,
      },
      section_index: [
        { id: "offense", name: "Offense", description: "Hit damage, DPS, crit" },
        { id: "defense", name: "Defense", description: "Armour, evasion, ES" },
        { id: "socket_groups", name: "Socket Groups", description: "Skill gems" },
        { id: "items", name: "Items", description: "Equipped gear" },
        { id: "keystones", name: "Keystones", description: "Allocated keystones" },
        { id: "tree", name: "Passive Tree", description: "Tree summary" },
      ],
      sections: {
        offense: {
          TotalDPS: 1_247_832,
          CombinedDPS: 1_247_832,
          AverageDamage: 8_432,
          Speed: 7.52,
          CritChance: 68.4,
          CritMultiplier: 420,
          HitChance: 100,
          ProjectileCount: 5,
          PierceChance: 100,
        },
        defense: {
          Armour: 1_240,
          PhysicalDamageReduction: 8.2,
          BlockChance: 42,
          SpellBlockChance: 42,
          LifeUnreserved: 4_891,
          EnergyShield: 2_104,
          LifeRegen: 312,
          EnergyShieldRecharge: 1_680,
          MovementSpeedMod: 130,
        },
        socket_groups: [
          {
            label: "Vaal Spark",
            enabled: true,
            slot: "Body Armour",
            isMainGroup: true,
            gems: [
              { name: "Vaal Spark", level: 21, quality: 23, enabled: true, color: "B", socketColor: "B", vaal: true, tags: "Vaal, Spell, Projectile, Duration, Lightning", description: "Launches unpredictable ones of ethereal lightning at nearby enemies.", castTime: 0.65, reqInt: 155, naturalMaxLevel: 20 },
              { name: "Spell Echo Support", level: 21, quality: 20, enabled: true, support: true, color: "B", socketColor: "B", tags: "Support, Spell, Duration", description: "Supported skills repeat an additional time.", reqInt: 111, naturalMaxLevel: 20 },
              { name: "Increased Critical Strikes Support", level: 20, quality: 20, enabled: true, support: true, color: "B", socketColor: "B", tags: "Support, Critical", reqInt: 111, naturalMaxLevel: 20 },
              { name: "Lightning Penetration Support", level: 21, quality: 20, enabled: true, support: true, color: "B", socketColor: "B", tags: "Support, Lightning", reqInt: 111, naturalMaxLevel: 20 },
              { name: "Inspiration Support", level: 20, quality: 20, enabled: true, support: true, color: "B", socketColor: "B", tags: "Support", reqInt: 111, naturalMaxLevel: 20 },
              { name: "Awakened Added Lightning Damage Support", level: 5, quality: 20, enabled: true, support: true, color: "B", socketColor: "B", tags: "Support, Lightning", reqInt: 111, naturalMaxLevel: 5 },
            ],
          },
          {
            label: "Auras",
            enabled: true,
            slot: "Helmet",
            isMainGroup: false,
            gems: [
              { name: "Wrath", level: 21, quality: 23, enabled: true, color: "B", socketColor: "B", tags: "Spell, AoE, Lightning, Aura", hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20 },
              { name: "Zealotry", level: 21, quality: 20, enabled: true, color: "B", socketColor: "B", tags: "Spell, AoE, Aura", hasGlobalEffect: true, reqInt: 155, naturalMaxLevel: 20 },
              { name: "Enlighten Support", level: 4, quality: 0, enabled: true, support: true, color: "W", socketColor: "W", tags: "Support", reqStr: 73, naturalMaxLevel: 5 },
            ],
          },
          {
            label: "Movement",
            enabled: true,
            slot: "Boots",
            isMainGroup: false,
            gems: [
              { name: "Shield Charge", level: 1, quality: 0, enabled: true, color: "R", socketColor: "R", tags: "Attack, AoE, Movement", castTime: 1.0, reqStr: 14, naturalMaxLevel: 20 },
              { name: "Faster Attacks Support", level: 20, quality: 20, enabled: true, support: true, color: "G", socketColor: "G", tags: "Support, Attack", reqDex: 111, naturalMaxLevel: 20 },
              { name: "Fortify Support", level: 20, quality: 20, enabled: true, support: true, color: "R", socketColor: "R", tags: "Support, Attack, Melee", reqStr: 111, naturalMaxLevel: 20 },
            ],
          },
          {
            label: "CWDT",
            enabled: true,
            slot: "Gloves",
            isMainGroup: false,
            gems: [
              { name: "Cast when Damage Taken Support", level: 2, quality: 0, enabled: true, support: true, color: "R", socketColor: "R", tags: "Support, Spell" },
              { name: "Immortal Call", level: 4, quality: 20, enabled: true, color: "R", socketColor: "R", tags: "Spell, Duration" },
              { name: "Increased Duration Support", level: 20, quality: 20, enabled: true, support: true, color: "R", socketColor: "R", tags: "Support, Duration" },
            ],
          },
        ],
        items: {
          "Body Armour": { name: "Shavronne's Wrappings", baseName: "Occultist's Vestment", rarity: "UNIQUE", type: "Body Armour", sockets: [{ color: "B", group: 0 }, { color: "B", group: 0 }, { color: "B", group: 0 }, { color: "B", group: 0 }, { color: "B", group: 0 }, { color: "B", group: 0 }] },
          Helmet: { name: "Crown of the Inward Eye", baseName: "Prophet Crown", rarity: "UNIQUE", type: "Helmet", sockets: [{ color: "B", group: 0 }, { color: "B", group: 0 }, { color: "W", group: 0 }] },
          "Weapon 1": { name: "Void Battery", baseName: "Prophecy Wand", rarity: "UNIQUE", type: "Wand" },
          Shield: { name: "Prism Guardian", baseName: "Archon Kite Shield", rarity: "UNIQUE", type: "Shield" },
          Gloves: { name: "Fingerless Silk Gloves", baseName: "Fingerless Silk Gloves", rarity: "RARE", type: "Gloves" },
          Boots: { name: "Stormcharger", baseName: "Plated Greaves", rarity: "UNIQUE", type: "Boots" },
          Belt: { name: "Crystal Belt", baseName: "Crystal Belt", rarity: "RARE", type: "Belt" },
          Amulet: { name: "Presence of Chayula", baseName: "Onyx Amulet", rarity: "UNIQUE", type: "Amulet" },
          "Ring 1": { name: "Opal Ring", baseName: "Opal Ring", rarity: "RARE", type: "Ring" },
          "Ring 2": { name: "Opal Ring", baseName: "Opal Ring", rarity: "RARE", type: "Ring" },
        },
        keystones: [
          "Chaos Inoculation",
          "Ghost Reaver",
          "Pain Attunement",
          "Unwavering Stance",
          "Vaal Pact",
        ],
        tree: {
          version: 24,
          allocated_nodes: 121,
        },
      },
    },
  };

  // Summary only (no detail sections requested)
  const summaryOnly = {
    icon_url: iconUrl,
    buildId: "def456",
    data: {
      character: {
        class: "Duelist",
        ascendancy: "Champion",
        level: 90,
      },
      summary: {
        CombinedDPS: 523_441,
        TotalDPS: 523_441,
        Life: 6_891,
        EnergyShield: 0,
        Mana: 234,
        Armour: 42_810,
        Evasion: 12_400,
        FireResist: 75,
        ColdResist: 76,
        LightningResist: 75,
        ChaosResist: 24,
        BlockChance: 0,
        SpellSuppressionChance: 100,
        MovementSpeedMod: 1.6,
        Str: 212,
        Dex: 187,
        Int: 78,
      },
      section_index: [
        { id: "offense", name: "Offense", description: "Hit damage, DPS, crit" },
        { id: "defense", name: "Defense", description: "Armour, evasion, ES" },
      ],
    },
  };

  // Offense + defense only
  const offenseDefense = {
    icon_url: iconUrl,
    buildId: "ghi789",
    data: {
      character: {
        class: "Ranger",
        ascendancy: "Deadeye",
        level: 100,
        bandit: "Alira",
      },
      summary: {
        CombinedDPS: 8_412_000,
        TotalDPS: 8_412_000,
        Life: 5_200,
        EnergyShield: 0,
        Mana: 312,
        Armour: 0,
        Evasion: 58_200,
        FireResist: 75,
        ColdResist: 75,
        LightningResist: 75,
        ChaosResist: -60,
        BlockChance: 0,
        SpellSuppressionChance: 100,
        MovementSpeedMod: 2.1,
        Str: 120,
        Dex: 342,
        Int: 95,
      },
      section_index: [],
      sections: {
        offense: {
          TotalDPS: 8_412_000,
          CombinedDPS: 8_412_000,
          AverageDamage: 142_300,
          Speed: 5.12,
          CritChance: 85.2,
          CritMultiplier: 580,
          HitChance: 100,
          ProjectileCount: 9,
          PierceChance: 100,
          ChainCount: 2,
          ForkCount: 1,
        },
        defense: {
          Evasion: 58_200,
          EvadeChance: 72,
          SpellSuppressionChance: 100,
          SpellSuppressionEffect: 50,
          LifeUnreserved: 5_200,
          LifeRegen: 485,
          MovementSpeedMod: 210,
        },
      },
    },
  };

  // Low-level minimal build
  const minimalBuild = {
    icon_url: iconUrl,
    buildId: "jkl012",
    data: {
      character: {
        class: "Marauder",
        ascendancy: "Marauder",
        level: 28,
      },
      summary: {
        CombinedDPS: 3_420,
        TotalDPS: 3_420,
        Life: 1_240,
        EnergyShield: 0,
        Mana: 89,
        Armour: 820,
        Evasion: 0,
        FireResist: 42,
        ColdResist: 18,
        LightningResist: 31,
        ChaosResist: 0,
        BlockChance: 0,
        SpellSuppressionChance: 0,
        MovementSpeedMod: 1.0,
        Str: 98,
        Dex: 32,
        Int: 18,
      },
      section_index: [],
    },
  };

  // Minion build with minion sections
  const minionBuild = {
    icon_url: iconUrl,
    buildId: "mno345",
    data: {
      character: {
        class: "Witch",
        ascendancy: "Necromancer",
        level: 92,
      },
      summary: {
        CombinedDPS: 0,
        TotalDPS: 0,
        Life: 5_820,
        EnergyShield: 1_240,
        Mana: 420,
        Armour: 2_100,
        Evasion: 0,
        FireResist: 75,
        ColdResist: 75,
        LightningResist: 75,
        ChaosResist: 42,
        BlockChance: 75,
        SpellSuppressionChance: 0,
        MovementSpeedMod: 1.35,
        Str: 82,
        Dex: 72,
        Int: 287,
        EnemyCurseLimit: 1,
      },
      section_index: [],
      sections: {
        minion_offense: {
          TotalDPS: 2_840_000,
          CombinedDPS: 2_840_000,
          AverageDamage: 48_200,
          Speed: 1.82,
          CritChance: 5,
          CritMultiplier: 130,
          HitChance: 100,
          MinionCount: 13,
        },
        minion_defense: {
          Life: 18_240,
          Armour: 4_200,
          FireResist: 75,
          ColdResist: 75,
          LightningResist: 75,
          ChaosResist: 40,
          LifeRegen: 2_400,
        },
      },
    },
  };
</script>

<!-- Full endgame build with all sections -->
<Story name="FullBuild">
  <div style="max-width: 700px;">
    <BuildPlanner data={fullBuild} />
  </div>
</Story>

<!-- Summary only, no detail sections -->
<Story name="SummaryOnly">
  <div style="max-width: 700px;">
    <BuildPlanner data={summaryOnly} />
  </div>
</Story>

<!-- Offense and defense sections only -->
<Story name="OffenseDefense">
  <div style="max-width: 700px;">
    <BuildPlanner data={offenseDefense} />
  </div>
</Story>

<!-- Low-level character with minimal stats -->
<Story name="MinimalBuild">
  <div style="max-width: 700px;">
    <BuildPlanner data={minimalBuild} />
  </div>
</Story>

<!-- Minion build with minion-specific sections -->
<Story name="MinionBuild">
  <div style="max-width: 700px;">
    <BuildPlanner data={minionBuild} />
  </div>
</Story>
