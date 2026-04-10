<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PriceTag from "./PriceTag.svelte";
  const { Story } = defineMeta({ title: "PoE/Components/PriceTag", tags: ["autodocs"] });

  const wrap = "background: var(--color-panel-bg); padding: 16px; border-radius: 8px;";
</script>

<!-- Both currencies -->
<Story name="BothCurrencies">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <PriceTag chaos={150} divine={1.2} />
    <PriceTag chaos={3500} divine={28} />
    <PriceTag chaos={45000} divine={360} />
  </div>
</Story>

<!-- Chaos only -->
<Story name="ChaosOnly">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <PriceTag chaos={5} />
    <PriceTag chaos={42} />
    <PriceTag chaos={180} />
  </div>
</Story>

<!-- Divine only -->
<Story name="DivineOnly">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <PriceTag divine={0.5} />
    <PriceTag divine={3} />
    <PriceTag divine={85} />
  </div>
</Story>

<!-- Low confidence -->
<Story name="LowConfidence">
  <div style="{wrap} display: flex; flex-direction: column; gap: 12px;">
    <PriceTag chaos={2200} divine={17.5} confidence="low" />
    <PriceTag chaos={15} confidence="low" />
  </div>
</Story>

<!-- Compact mode -->
<Story name="Compact">
  <div style="{wrap} display: flex; flex-direction: column; gap: 8px;">
    <PriceTag chaos={150} divine={1.2} compact />
    <PriceTag chaos={42} compact />
    <PriceTag divine={5} compact />
    <PriceTag chaos={15} confidence="low" compact />
  </div>
</Story>

<!-- Inline with text -->
<Story name="InlineWithText">
  <div style="{wrap} font-family: var(--font-body); font-size: 14px; color: var(--color-text); display: flex; flex-direction: column; gap: 8px;">
    <span>Kaom's Heart: <PriceTag chaos={150} divine={1.2} compact /></span>
    <span>Headhunter: <PriceTag chaos={45000} divine={360} compact /></span>
    <span>Tabula Rasa: <PriceTag chaos={5} compact /></span>
  </div>
</Story>
