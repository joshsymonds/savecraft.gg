<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ProgressBar from "./ProgressBar.svelte";
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Charts/ProgressBar",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <Panel padding="var(--space-xl)">
    <div style="display: flex; flex-direction: column; gap: 12px; max-width: 400px;">
      <ProgressBar value={75} label="75%" />
    </div>
  </Panel>
</Story>

<Story name="Variants">
  <Panel padding="var(--space-xl)">
    <div style="display: flex; flex-direction: column; gap: 12px; max-width: 400px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Positive</span>
        <ProgressBar value={92} label="92%" variant="positive" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Negative</span>
        <ProgressBar value={23} label="23%" variant="negative" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Highlight</span>
        <ProgressBar value={68} label="68%" variant="highlight" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Info</span>
        <ProgressBar value={50} label="50%" variant="info" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Warning</span>
        <ProgressBar value={85} label="85%" variant="warning" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted); min-width: 60px;">Muted</span>
        <ProgressBar value={40} label="40%" variant="muted" />
      </div>
    </div>
  </Panel>
</Story>

<Story name="SkillLevels">
  <Panel padding="var(--space-xl)">
    <Section title="Colonist Skills" count={5}>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text); min-width: 90px;">Shooting</span>
          <ProgressBar value={14} max={20} label="14" variant="positive" />
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text); min-width: 90px;">Melee</span>
          <ProgressBar value={6} max={20} label="6" variant="warning" />
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text); min-width: 90px;">Construction</span>
          <ProgressBar value={11} max={20} label="11" variant="info" />
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text); min-width: 90px;">Medicine</span>
          <ProgressBar value={18} max={20} label="18" variant="positive" />
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-body); font-size: 14px; color: var(--color-text); min-width: 90px;">Cooking</span>
          <ProgressBar value={2} max={20} label="2" variant="negative" />
        </div>
      </div>
    </Section>
  </Panel>
</Story>

<Story name="OverBudget">
  <Panel padding="var(--space-xl)">
    <Section title="Gene Build Budget">
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 400px;">
        <div>
          <span style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px;">Complexity 8 / 6</span>
          <ProgressBar value={8} max={6} label="8/6" variant="negative" />
        </div>
        <div>
          <span style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px;">Metabolism -3 / -5</span>
          <ProgressBar value={3} max={5} label="-3" variant="positive" />
        </div>
      </div>
    </Section>
  </Panel>
</Story>

<Story name="GrowthProgress">
  <Panel padding="var(--space-xl)">
    <Section title="Current Fields">
      <div style="display: flex; flex-direction: column; gap: 10px; max-width: 400px;">
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-family: var(--font-heading); font-size: 14px; color: var(--color-text);">Rice (Zone 1, 36 tiles)</span>
            <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">5.8 days</span>
          </div>
          <ProgressBar value={72} label="72%" variant="positive" height={12} />
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-family: var(--font-heading); font-size: 14px; color: var(--color-text);">Corn (Zone 2, 36 tiles)</span>
            <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">11.3 days</span>
          </div>
          <ProgressBar value={5.6} label="5.6%" variant="warning" height={12} />
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-family: var(--font-heading); font-size: 14px; color: var(--color-text);">Devilstrand (Zone 3, 24 tiles)</span>
            <span style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-muted);">22.5 days</span>
          </div>
          <ProgressBar value={31} label="31%" variant="highlight" height={12} />
        </div>
      </div>
    </Section>
  </Panel>
</Story>
