<!--
  @component
  MTG card display composing Panel + Section with mana pips and color bar.
  Uses the shared layout components — no custom header/title styling.
-->
<script lang="ts">
  import Panel from "../layout/Panel.svelte";
  import Section from "../layout/Section.svelte";
  import Badge from "../data/Badge.svelte";
  import ManaCost from "./ManaCost.svelte";
  import ColorBar from "./ColorBar.svelte";
  import OracleText from "./OracleText.svelte";
  import { WUBRG_SOLID, WUBRG_ACCENT, COLORLESS_SOLID, COLORLESS_ACCENT } from "./colors";

  interface MtgCardData {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText?: string;
    colors?: string[];
    colorIdentity?: string[];
    rarity: string;
    keywords?: string[];
  }

  interface Props {
    card: MtgCardData;
    /** Game icon URL for background watermark */
    iconUrl?: string;
  }

  let { card, iconUrl }: Props = $props();

  const RARITY_VARIANT: Record<string, string> = {
    mythic: "legendary",
    rare: "rare",
    uncommon: "uncommon",
    common: "common",
  };

  let colorIdentity = $derived(card.colorIdentity ?? card.colors ?? []);

  // Dark color for Panel border and ColorBar segments
  let borderColor = $derived.by(() => {
    if (colorIdentity.length === 0) return COLORLESS_SOLID;
    if (colorIdentity.length === 1) return WUBRG_SOLID[colorIdentity[0]] ?? COLORLESS_SOLID;
    return "var(--color-gold)";
  });

  // Bright color for Section accent (divider, count pill)
  let accentColor = $derived.by(() => {
    if (colorIdentity.length === 0) return COLORLESS_ACCENT;
    if (colorIdentity.length === 1) return WUBRG_ACCENT[colorIdentity[0]] ?? COLORLESS_ACCENT;
    return "var(--color-gold)";
  });

  let isMythic = $derived(card.rarity === "mythic");
</script>

<div class="mtg-card" class:mythic={isMythic}>
  <Panel accent={borderColor}>
    {#if iconUrl}
      <img class="card-watermark" src={iconUrl} alt="" aria-hidden="true" />
    {/if}
    <Section
      title={card.name}
      subtitle={card.typeLine}
      accent={accentColor}
      headerTint={accentColor}
      titleColor={accentColor}
    >
      {#snippet icons()}
        {#if card.manaCost}
          <ManaCost cost={card.manaCost} size="md" />
        {/if}
      {/snippet}
      {#snippet badge()}
        <Badge label={card.rarity} variant={RARITY_VARIANT[card.rarity] ?? "muted"} />
      {/snippet}
      {#snippet divider()}
        <ColorBar colors={colorIdentity} height={3} />
      {/snippet}
      <div class="card-body">
        {#if card.oracleText}
          <OracleText text={card.oracleText} />
        {/if}
      </div>
    </Section>
  </Panel>
</div>

<style>
  .mtg-card {
    width: 100%;
  }

  .mtg-card.mythic {
    filter: drop-shadow(0 0 8px rgba(232, 164, 48, 0.4));
  }

  .card-body {
    min-height: 48px;
  }

  .card-watermark {
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 48px;
    height: 48px;
    object-fit: contain;
    opacity: 0.2;
    pointer-events: none;
    z-index: 0;
  }
</style>
