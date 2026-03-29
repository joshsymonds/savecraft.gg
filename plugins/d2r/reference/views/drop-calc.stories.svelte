<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import DropCalc from "./drop-calc.svelte";

  const iconUrl = "/plugins/d2r/icon.png";

  const { Story } = defineMeta({
    title: "D2R/DropCalc",
    tags: ["autodocs"],
  });
</script>

<Story name="MonsterDrops">
  <DropCalc data={{
    mode: "monster",
    monster_name: "Mephisto",
    difficulty: "Hell",
    mf: 250,
    players: 1,
    drops: [
      { name: "Arachnid Mesh", base_name: "Spiderweb Sash", code: "umpl", unique: 0.0098, set: 0, rare: 0.052, magic: 0.118, base_prob: 0.00285 },
      { name: "Harlequin Crest", base_name: "Shako", code: "uhlm", unique: 0.0073, set: 0, rare: 0.048, magic: 0.112, base_prob: 0.00195 },
      { name: "War Traveler", base_name: "Battle Boots", code: "xhbt", unique: 0.0061, set: 0, rare: 0.041, magic: 0.095, base_prob: 0.00178 },
      { name: "Skin of the Vipermagi", base_name: "Serpentskin Armor", code: "xea", unique: 0.0045, set: 0, rare: 0.038, magic: 0.089, base_prob: 0.00152 },
      { name: "Tal Rasha's Guardianship", base_name: "Lacquered Plate", code: "ult", unique: 0, set: 0.0082, rare: 0.044, magic: 0.101, base_prob: 0.00211 },
      { name: "The Oculus", base_name: "Swirling Crystal", code: "oba", unique: 0.0039, set: 0, rare: 0.035, magic: 0.082, base_prob: 0.00138 },
      { name: "Stormshield", base_name: "Monarch", code: "uit", unique: 0.0032, set: 0, rare: 0.031, magic: 0.075, base_prob: 0.00121 },
      { name: "Tal Rasha's Lidless Eye", base_name: "Swirling Crystal", code: "oba", unique: 0, set: 0.0055, rare: 0.035, magic: 0.082, base_prob: 0.00138 },
      { name: "Chance Guards", base_name: "Chain Gloves", code: "mgl", unique: 0.0028, set: 0, rare: 0.028, magic: 0.068, base_prob: 0.00098 },
      { name: "Goldwrap", base_name: "Heavy Belt", code: "mbl", unique: 0.0022, set: 0, rare: 0.024, magic: 0.061, base_prob: 0.00082 },
    ],
    total: 87,
    offset: 0,
    limit: 50,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="MonsterDropsNoMF">
  <DropCalc data={{
    mode: "monster",
    monster_name: "Andariel",
    difficulty: "Nightmare",
    mf: 0,
    players: 3,
    drops: [
      { name: "Stone of Jordan", base_name: "Ring", code: "rin", unique: 0.0012, set: 0, rare: 0.031, magic: 0.078, base_prob: 0.00045 },
      { name: "The Eye of Etlich", base_name: "Amulet", code: "amu", unique: 0.0008, set: 0, rare: 0.025, magic: 0.065, base_prob: 0.00032 },
      { name: "Tal Rasha's Adjudication", base_name: "Amulet", code: "amu", unique: 0, set: 0.0015, rare: 0.025, magic: 0.065, base_prob: 0.00032 },
    ],
    total: 42,
    offset: 0,
    limit: 50,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ItemSources">
  <DropCalc data={{
    mode: "item",
    item_name: "Harlequin Crest",
    item_base: "Shako",
    quality: "unique",
    mf: 300,
    players: 1,
    sources: [
      { monster: "Mephisto", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Durance of Hate Level 3", mlvl: 87, chance: 0.0073 },
      { monster: "Andariel", is_boss: true, difficulty: "Hell", tc_type: "Quest", area: "Catacombs Level 4", mlvl: 75, chance: 0.0058 },
      { monster: "Diablo", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Chaos Sanctuary", mlvl: 94, chance: 0.0041 },
      { monster: "Pindleskin", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Nihlathak's Temple", mlvl: 86, chance: 0.0035 },
      { monster: "Baal", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Worldstone Chamber", mlvl: 99, chance: 0.0029 },
      { monster: "Council Member", is_boss: false, difficulty: "Hell", tc_type: "Champion", area: "Travincal", mlvl: 83, chance: 0.0018 },
      { monster: "Eldritch the Rectifier", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Frigid Highlands", mlvl: 84, chance: 0.0015 },
      { monster: "Shenk the Overseer", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Frigid Highlands", mlvl: 85, chance: 0.0012 },
    ],
    total: 187,
    offset: 0,
    limit: 50,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ItemSourcesSetItem">
  <DropCalc data={{
    mode: "item",
    item_name: "Tal Rasha's Guardianship",
    item_base: "Lacquered Plate",
    quality: "set",
    mf: 0,
    players: 1,
    sources: [
      { monster: "Mephisto", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Durance of Hate Level 3", mlvl: 87, chance: 0.0082 },
      { monster: "Baal", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Worldstone Chamber", mlvl: 99, chance: 0.0051 },
      { monster: "Diablo", is_boss: true, difficulty: "Hell", tc_type: "Unique", area: "Chaos Sanctuary", mlvl: 94, chance: 0.0044 },
    ],
    total: 45,
    offset: 0,
    limit: 50,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ItemSearch">
  <DropCalc data={{
    mode: "search",
    query: "Cannot Be Frozen",
    items: [
      {
        name: "Raven Frost",
        base_name: "Ring",
        is_set: false,
        level_req: 45,
        qlevel: 53,
        stats: [
          "Cannot Be Frozen",
          "+150-250 to Attack Rating",
          "+15-20 to Dexterity",
          "+40 to Mana",
          "+20 Cold Absorb",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0052 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0031 },
          { monster: "Andariel", difficulty: "Hell", chance: 0.0024 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0019 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0015 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0012 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0009 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0008 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0006 },
          { monster: "Summoner", difficulty: "Hell", chance: 0.0004 },
        ],
      },
      {
        name: "Kira's Guardian",
        base_name: "Tiara",
        is_set: false,
        level_req: 77,
        qlevel: 85,
        stats: [
          "Cannot Be Frozen",
          "+50-120 Defense",
          "All Resistances +50-70",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0041 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0018 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0012 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0010 },
          { monster: "Nihlathak", difficulty: "Hell", chance: 0.0008 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0007 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0005 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0004 },
          { monster: "Thresh Socket", difficulty: "Hell", chance: 0.0003 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0003 },
        ],
      },
      {
        name: "Duriel's Shell",
        base_name: "Cuirass",
        is_set: false,
        level_req: 41,
        qlevel: 49,
        stats: [
          "Cannot Be Frozen",
          "+160-200% Enhanced Defense",
          "+1-3 to All Skills (by character level)",
          "+15 to Strength",
          "All Resistances +20",
          "+50 to Life",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0068 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0042 },
          { monster: "Andariel", difficulty: "Hell", chance: 0.0035 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0019 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0016 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0013 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0009 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0007 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0006 },
          { monster: "Summoner", difficulty: "Hell", chance: 0.0004 },
        ],
      },
      {
        name: "Blackhorn's Face",
        base_name: "Death Mask",
        is_set: false,
        level_req: 41,
        qlevel: 55,
        stats: [
          "Cannot Be Frozen",
          "+180-220% Enhanced Defense",
          "Prevent Monster Heal",
          "Slows Target by 25%",
          "+25 Lightning Absorb",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0061 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0038 },
          { monster: "Andariel", difficulty: "Hell", chance: 0.0029 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0017 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0014 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0011 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0008 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0006 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0005 },
          { monster: "Summoner", difficulty: "Hell", chance: 0.0003 },
        ],
      },
    ],
    total: 4,
    icon_url: iconUrl,
  }} />
</Story>

<Story name="ItemSearchSetItems">
  <DropCalc data={{
    mode: "search",
    query: "Tal Rasha",
    items: [
      {
        name: "Tal Rasha's Guardianship",
        base_name: "Lacquered Plate",
        is_set: true,
        set_name: "Tal Rasha's Wrappings",
        level_req: 65,
        qlevel: 84,
        stats: [
          "+400 Defense",
          "Magic Damage Reduced by 15",
          "+40% Faster Hit Recovery",
          "Cold Resist +40%",
          "Lightning Resist +40%",
          "Fire Resist +40%",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0105 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0082 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0051 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0044 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0031 },
          { monster: "Nihlathak", difficulty: "Hell", chance: 0.0022 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0015 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0011 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0009 },
          { monster: "Thresh Socket", difficulty: "Hell", chance: 0.0006 },
        ],
      },
      {
        name: "Tal Rasha's Lidless Eye",
        base_name: "Swirling Crystal",
        is_set: true,
        set_name: "Tal Rasha's Wrappings",
        level_req: 26,
        qlevel: 35,
        stats: [
          "+1-2 to Sorceress Skill Levels",
          "+57 to Mana",
          "+10 to Energy",
          "+20% Faster Cast Rate",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0088 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0055 },
          { monster: "Andariel", difficulty: "Hell", chance: 0.0041 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0028 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0021 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0015 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0010 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0007 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0005 },
          { monster: "Summoner", difficulty: "Hell", chance: 0.0003 },
        ],
      },
      {
        name: "Tal Rasha's Adjudication",
        base_name: "Amulet",
        is_set: true,
        set_name: "Tal Rasha's Wrappings",
        level_req: 67,
        qlevel: 86,
        stats: [
          "+2 to Sorceress Skill Levels",
          "+42 to Life",
          "+50 to Mana",
          "Lightning Resist +33%",
        ],
        top_sources: [
          { monster: "Uber Diablo", difficulty: "Hell", chance: 0.0025 },
          { monster: "Mephisto", difficulty: "Hell", chance: 0.0015 },
          { monster: "Baal", difficulty: "Hell", chance: 0.0009 },
          { monster: "Diablo", difficulty: "Hell", chance: 0.0007 },
          { monster: "Pindleskin", difficulty: "Hell", chance: 0.0005 },
          { monster: "Andariel", difficulty: "Hell", chance: 0.0004 },
          { monster: "Nihlathak", difficulty: "Hell", chance: 0.0003 },
          { monster: "Council Member", difficulty: "Hell", chance: 0.0002 },
          { monster: "Eldritch", difficulty: "Hell", chance: 0.0002 },
          { monster: "Shenk", difficulty: "Hell", chance: 0.0001 },
        ],
      },
    ],
    total: 3,
    icon_url: iconUrl,
  }} />
</Story>
