<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import GemTooltip from "./GemTooltip.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/GemTooltip", tags: ["autodocs"] });

  const wrap = "background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 12px; width: 340px;";
</script>

<!-- Active skill with full data -->
<Story name="ActiveSkill">
  <div style={wrap}>
    <GemTooltip
      name="Vaal Spark"
      color="B"
      level={21}
      quality={23}
      vaal
      tags="Vaal, Spell, Projectile, Duration, Lightning"
      description="Launches unpredictable ones of ethereal lightning at nearby enemies."
      castTime={0.65}
      reqStr={0}
      reqDex={0}
      reqInt={155}
      naturalMaxLevel={20}
    />
  </div>
</Story>

<!-- Support gem -->
<Story name="SupportGem">
  <div style={wrap}>
    <GemTooltip
      name="Spell Echo Support"
      color="B"
      support
      level={21}
      quality={20}
      tags="Support, Spell, Duration"
      description="Supported skills repeat an additional time. Cannot support Vaal skills, totem skills, channelling skills, triggered skills, instant skills, or skills with a reservation."
      reqStr={0}
      reqDex={0}
      reqInt={111}
      naturalMaxLevel={20}
    />
  </div>
</Story>

<!-- Aura with global effect -->
<Story name="Aura">
  <div style={wrap}>
    <GemTooltip
      name="Wrath"
      color="B"
      level={21}
      quality={23}
      tags="Spell, AoE, Lightning, Aura"
      description="Casts an aura that grants lightning damage to you and your allies."
      hasGlobalEffect
      reqStr={0}
      reqDex={0}
      reqInt={155}
      naturalMaxLevel={20}
    />
  </div>
</Story>

<!-- Anomalous quality -->
<Story name="AltQuality">
  <div style={wrap}>
    <GemTooltip
      name="Determination"
      color="R"
      level={20}
      quality={20}
      qualityId="Anomalous"
      tags="Spell, AoE, Aura"
      description="Casts an aura that grants armour to you and your allies."
      hasGlobalEffect
      reqStr={155}
      reqDex={0}
      reqInt={0}
      naturalMaxLevel={20}
    />
  </div>
</Story>

<!-- Empower (low max level, no description) -->
<Story name="Empower">
  <div style={wrap}>
    <GemTooltip
      name="Empower Support"
      color="R"
      support
      level={4}
      quality={0}
      tags="Support"
      reqStr={111}
      reqDex={0}
      reqInt={0}
      naturalMaxLevel={5}
    />
  </div>
</Story>

<!-- Minimal data (name only) -->
<Story name="Minimal">
  <div style={wrap}>
    <GemTooltip name="Unknown Gem" />
  </div>
</Story>

<!-- Mixed attribute requirements -->
<Story name="MixedRequirements">
  <div style={wrap}>
    <GemTooltip
      name="Tornado Shot"
      color="G"
      level={21}
      quality={23}
      tags="Attack, Projectile, Bow"
      description="Fires a piercing shot that travels until it reaches the targeted location. It then bursts, firing projectiles in all directions."
      castTime={1.0}
      reqStr={0}
      reqDex={212}
      reqInt={0}
      naturalMaxLevel={20}
    />
  </div>
</Story>
