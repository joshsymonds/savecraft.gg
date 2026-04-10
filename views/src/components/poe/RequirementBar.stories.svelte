<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RequirementBar from "./RequirementBar.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/RequirementBar", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- All three attributes -->
<Story name="AllAttributes">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={68} str={155} dex={0} int={68} />
  </div>
</Story>

<!-- Strength-heavy (Marauder gear) -->
<Story name="StrengthHeavy">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={60} str={212} />
  </div>
</Story>

<!-- Dexterity-heavy (Ranger gear) -->
<Story name="DexterityHeavy">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={70} dex={155} int={68} />
  </div>
</Story>

<!-- Intelligence-heavy (Witch gear) -->
<Story name="IntelligenceHeavy">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={62} int={180} />
  </div>
</Story>

<!-- Level only (e.g. jewels) -->
<Story name="LevelOnly">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={40} />
  </div>
</Story>

<!-- High-end unique item -->
<Story name="HighEndUnique">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <RequirementBar level={68} str={155} dex={100} int={68} />
  </div>
</Story>

<!-- No requirements (shouldn't render anything) -->
<Story name="NoRequirements">
  <div style="{wrap}">
    <span style="color: var(--color-text-muted); font-family: var(--font-body);">No requirements (empty render):</span>
    <RequirementBar />
  </div>
</Story>
