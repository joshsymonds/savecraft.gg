<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import GemSearch from "./gem-search.svelte";
  const { Story } = defineMeta({ title: "PoE/Views/GemSearch", tags: ["autodocs"] });

  const iconUrl = "/plugins/poe/icon.png";

  const sparkResult = {
    icon_url: iconUrl,
    query: "spark",
    gems: [
      {
        name: "Spark",
        color: "B",
        tags: ["Spell", "Projectile", "Lightning", "Duration"],
        is_support: false,
        level_requirement: 70,
        int_requirement: 155,
        cast_time: 0.65,
        mana_cost: "12",
        description: "Launches unpredictable ones of energy that move randomly and damage each enemy they hit.",
        stats_at_20: [
          "Deals 42 to 800 Lightning Damage",
          "Fires 2 additional Projectiles",
          "50% increased Projectile Speed",
          "Base duration is 3.50 seconds",
        ],
      },
      {
        name: "Vaal Spark",
        color: "B",
        tags: ["Vaal", "Spell", "Projectile", "Lightning", "Duration"],
        is_support: false,
        level_requirement: 70,
        int_requirement: 155,
        cast_time: 0.65,
        mana_cost: "12",
        description: "Launches a nova of sparks in all directions. Has a limited number of uses.",
        stats_at_20: [
          "Deals 42 to 800 Lightning Damage",
          "Fires 150 Projectiles",
          "Base duration is 4.00 seconds",
          "50% increased Projectile Speed",
        ],
      },
    ],
  };

  const supportResult = {
    icon_url: iconUrl,
    query: "lifetap",
    gems: [
      {
        name: "Lifetap Support",
        color: "R",
        tags: ["Support", "Duration"],
        is_support: true,
        level_requirement: 70,
        str_requirement: 111,
        description: "Supports any non-blessing skill. Minions cannot gain the Lifetap buff.",
        mana_multiplier: 200,
        exclude_skill_types: ["Blessing"],
        minion_excluded_effects: [
          "Supported Skills deal 19% more Damage while you have Lifetap",
          "Gain Lifetap after Spending a total of 273 Life",
        ],
        stats_at_20: [
          "Supported Skills deal 19% more Damage while you have Lifetap",
          "Gain Lifetap after Spending a total of 273 Life",
          "Base duration is 4 seconds",
          "Supported Skills Cost Life instead of Mana",
        ],
      },
      {
        name: "Infused Channelling Support",
        color: "B",
        tags: ["Support"],
        is_support: true,
        level_requirement: 70,
        int_requirement: 111,
        description: "Supports any channelling skill. Cannot modify the skills of minions.",
        mana_multiplier: 120,
        cannot_support_minions: true,
        require_skill_types: ["Channel"],
        stats_at_20: [
          "Supported Skills deal 39% more Damage",
          "12% less Damage taken when Hit while Channelling",
        ],
      },
      {
        name: "Spell Echo Support",
        color: "B",
        tags: ["Support", "Spell"],
        is_support: true,
        level_requirement: 38,
        int_requirement: 68,
        description: "Supported skills repeat an additional time.",
        mana_multiplier: 140,
        require_skill_types: ["Spell"],
        stats_at_20: [
          "Supported Skills Repeat an additional time",
          "Supported Skills have 10% less Cast Speed",
          "Supported Skills deal 30% more Damage with Hits and Ailments for each Repeat",
        ],
        supports_tags: ["Spell"],
      },
    ],
  };

  const multiColorResult = {
    icon_url: iconUrl,
    query: "strike",
    gems: [
      {
        name: "Molten Strike",
        color: "R",
        tags: ["Attack", "Projectile", "AoE", "Fire", "Melee"],
        is_support: false,
        level_requirement: 28,
        str_requirement: 98,
        cast_time: 1.0,
        mana_cost: "6",
        stats_at_20: [
          "Deals 130% of Base Attack Damage",
          "60% of Physical Damage Converted to Fire Damage",
          "Fires 6 additional Projectiles",
          "Projectiles deal 40% less Damage",
        ],
      },
      {
        name: "Wild Strike",
        color: "G",
        tags: ["Attack", "Melee", "Lightning", "Cold", "Fire"],
        is_support: false,
        level_requirement: 28,
        dex_requirement: 98,
        cast_time: 1.0,
        mana_cost: "6",
        stats_at_20: [
          "Deals 165% of Base Attack Damage",
          "100% of Physical Damage Converted to a random Element",
          "60% increased Elemental Damage",
        ],
      },
      {
        name: "Dual Strike",
        color: "G",
        tags: ["Attack", "Melee", "Dual Wield"],
        is_support: false,
        level_requirement: 1,
        dex_requirement: 14,
        cast_time: 1.0,
        mana_cost: "5",
        stats_at_20: [
          "Deals 145% of Base Attack Damage",
          "20% chance to deal Double Damage while Dual Wielding",
          "10% more Attack Speed while Dual Wielding",
        ],
      },
    ],
  };

  const emptyResult = {
    icon_url: iconUrl,
    query: "nonexistent gem xyz",
    gems: [],
  };
</script>

<!-- Spark search (skill gem results) -->
<Story name="SparkSearch">
  <GemSearch data={sparkResult} />
</Story>

<!-- Support gem search -->
<Story name="SupportGemSearch">
  <GemSearch data={supportResult} />
</Story>

<!-- Multi-color results -->
<Story name="MultiColorResults">
  <GemSearch data={multiColorResult} />
</Story>

<!-- Empty results -->
<Story name="NoResults">
  <GemSearch data={emptyResult} />
</Story>
