<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";
  import Section from "./Section.svelte";
  import CardGrid from "./CardGrid.svelte";
  import SplitLayout from "./SplitLayout.svelte";
  import Divider from "./Divider.svelte";
  import ProgressRing from "../charts/ProgressRing.svelte";
  import KeyValue from "../data/KeyValue.svelte";
  import Badge from "../data/Badge.svelte";

  const { Story } = defineMeta({
    title: "Components/Layout/Panel",
    tags: ["autodocs"],
  });
</script>

<Story name="Default">
  <div style="width: 400px;">
    <Panel>
      <p style="font-family: var(--font-heading); font-size: 18px; font-weight: 600; color: var(--color-gold); margin-bottom: 8px;">
        Diablo II: Resurrected
      </p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">
        Hammerdin — Level 92 Paladin
      </p>
    </Panel>
  </div>
</Story>

<Story name="WithAccent">
  <div style="display: flex; flex-direction: column; gap: 12px; width: 400px;">
    <Panel accent="var(--color-rarity-legendary)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-legendary);">Legendary Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Windforce — Hydra Bow</p>
    </Panel>
    <Panel accent="var(--color-rarity-epic)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-epic);">Epic Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Tal Rasha's Guardianship</p>
    </Panel>
    <Panel accent="var(--color-rarity-rare)">
      <p style="font-family: var(--font-heading); font-weight: 600; color: var(--color-rarity-rare);">Rare Item</p>
      <p style="font-family: var(--font-body); font-size: 14px; color: var(--color-text-dim);">Storm Gyre — Bone Ring</p>
    </Panel>
  </div>
</Story>

<Story name="NestedColonists">
  <div style="width: 550px;">
    <Panel>
      <Section title="Your Colonists" count={3}>
        <CardGrid minWidth={220}>
          <Panel nested>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <p style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-gold);">Valla</p>
              <Badge label="Researcher" variant="info" />
              <div style="display: flex; align-items: center; margin-top: 4px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={82} label="82%" variant="positive" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Mood</span>
                </div>
                <Divider direction="vertical" decoration="none" />
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={65} label="65%" variant="highlight" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Food</span>
                </div>
              </div>
            </div>
          </Panel>
          <Panel nested>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <p style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-gold);">Tynan</p>
              <Badge label="Constructor" variant="highlight" />
              <div style="display: flex; align-items: center; margin-top: 4px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={45} label="45%" variant="warning" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Mood</span>
                </div>
                <Divider direction="vertical" decoration="none" />
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={90} label="90%" variant="positive" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Food</span>
                </div>
              </div>
            </div>
          </Panel>
          <Panel nested>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <p style="font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-gold);">Engie</p>
              <Badge label="Doctor" variant="positive" />
              <div style="display: flex; align-items: center; margin-top: 4px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={71} label="71%" variant="info" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Mood</span>
                </div>
                <Divider direction="vertical" decoration="none" />
                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <ProgressRing value={38} label="38%" variant="negative" size={56} />
                  <span style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-muted); text-transform: uppercase;">Food</span>
                </div>
              </div>
            </div>
          </Panel>
        </CardGrid>
      </Section>
    </Panel>
  </div>
</Story>

<Story name="NestedWithStats">
  <div style="width: 450px;">
    <Panel>
      <Section title="Character Overview" subtitle="Hammerdin — Level 92 Paladin">
        <SplitLayout direction="horizontal">
          {#snippet primary()}
            <Panel nested padding="var(--space-md)">
              <KeyValue items={[
                { key: "Strength", value: 156 },
                { key: "Dexterity", value: 75 },
                { key: "Vitality", value: 300, variant: "highlight" },
                { key: "Energy", value: 15 },
              ]} />
            </Panel>
          {/snippet}
          {#snippet secondary()}
            <Panel nested padding="var(--space-md)">
              <KeyValue items={[
                { key: "Fire Res", value: "75%", variant: "positive" },
                { key: "Cold Res", value: "75%", variant: "positive" },
                { key: "Light Res", value: "43%", variant: "warning" },
                { key: "Poison Res", value: "-12%", variant: "negative" },
              ]} />
            </Panel>
          {/snippet}
        </SplitLayout>
      </Section>
    </Panel>
  </div>
</Story>
