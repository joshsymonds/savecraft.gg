<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Divider from "./Divider.svelte";
  import Panel from "./Panel.svelte";
  import Section from "./Section.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/Divider",
    tags: ["autodocs"],
  });
</script>

<Story name="Diamond">
  <div style="width: 500px;">
    <Panel>
      <Section title="Draft Analysis">
        <p style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);">
          Your draft went off-track in pack 2 — three speculative picks pulled you into a third color.
        </p>
        <Divider />
        <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-muted);">
          Recommended: cut the green splash and commit to Dimir. You have enough playables in UB.
        </p>
      </Section>
    </Panel>
  </div>
</Story>

<Story name="Cross">
  <div style="width: 500px;">
    <Panel>
      <p style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text); margin-bottom: 4px;">Surgery Success: 85.5%</p>
      <Divider decoration="cross" />
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-muted);">
        Best surgeon available. Glitterworld medicine recommended for 98% ceiling.
      </p>
    </Panel>
  </div>
</Story>

<Story name="NoDeco">
  <div style="width: 500px;">
    <Panel>
      <p style="font-family: var(--font-heading); font-size: 16px; color: var(--color-text);">Section One</p>
      <Divider decoration="none" />
      <p style="font-family: var(--font-heading); font-size: 16px; color: var(--color-text);">Section Two</p>
    </Panel>
  </div>
</Story>

<Story name="Vertical">
  <div style="width: 500px;">
    <Panel>
      <div style="display: flex; height: 120px;">
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span style="font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-positive);">7-2</span>
          <span style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-text-muted); text-transform: uppercase;">This Draft</span>
        </div>
        <Divider direction="vertical" />
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span style="font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-highlight);">58.4%</span>
          <span style="font-family: var(--font-pixel); font-size: 8px; color: var(--color-text-muted); text-transform: uppercase;">Overall WR</span>
        </div>
      </div>
    </Panel>
  </div>
</Story>
