<!--
  @component
  PoE-style item tooltip frame with rarity-colored borders, header, separator,
  and mod sections. Faithfully reproduces the in-game item tooltip aesthetic.

  The frame has a dark background with a double border in the rarity color,
  a header area with item name (and optional base type), and content slots
  for properties, requirements, implicit mods, explicit mods, etc.

  Usage:
    <ItemFrame name="Kaom's Heart" baseName="Glorious Plate" rarity="UNIQUE">
      {#snippet properties()}...{/snippet}
      {#snippet implicits()}...{/snippet}
      {#snippet explicits()}...{/snippet}
    </ItemFrame>
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { RARITY_COLORS } from "./colors";

  interface Props {
    /** Item name */
    name: string;
    /** Base type name (shown below name for Rare/Unique) */
    baseName?: string;
    /** PoE rarity: NORMAL, MAGIC, RARE, UNIQUE */
    rarity?: string;
    /** Item type label (e.g. "Skill Gem", "Body Armour") */
    itemType?: string;
    /** Optional icon URL */
    iconUrl?: string;
    /** Properties section (armour, evasion, etc.) */
    properties?: Snippet;
    /** Requirements section */
    requirements?: Snippet;
    /** Implicit mods (above the separator) */
    implicits?: Snippet;
    /** Explicit mods (main mod block) */
    explicits?: Snippet;
    /** Footer content (flavour text, etc.) */
    footer?: Snippet;
  }

  let { name, baseName, rarity = "NORMAL", itemType, iconUrl,
    properties, requirements, implicits, explicits, footer }: Props = $props();

  let color = $derived(
    RARITY_COLORS[rarity?.toUpperCase() as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.NORMAL
  );

  /** Whether to show the base name line (Rare/Unique have separate name + base) */
  let showBase = $derived(
    baseName && baseName !== name &&
    (rarity?.toUpperCase() === "RARE" || rarity?.toUpperCase() === "UNIQUE")
  );

  /* Type narrowing helpers — Svelte's {#if} can't narrow optional Snippet types,
     so we guard with these and use non-null assertion (!) in @render calls. */
</script>

<div class="item-frame" style:--rarity-color={color}>
  <!-- Header -->
  <div class="header">
    {#if iconUrl}
      <img class="icon" src={iconUrl} alt="" />
    {/if}
    <div class="header-text">
      <div class="item-name">{name}</div>
      {#if showBase}
        <div class="base-name">{baseName}</div>
      {/if}
    </div>
    {#if itemType}
      <span class="item-type">{itemType}</span>
    {/if}
  </div>

  <!-- Separator -->
  <div class="separator">
    <div class="sep-line"></div>
    <div class="sep-diamond"></div>
    <div class="sep-line"></div>
  </div>

  <!-- Properties (armour, evasion, etc.) -->
  {#if properties}
    <div class="section">
      {@render properties()}
    </div>
  {/if}

  <!-- Requirements -->
  {#if requirements}
    <div class="section">
      {@render requirements()}
    </div>
  {/if}

  <!-- Implicit mods -->
  {#if implicits}
    <div class="separator">
      <div class="sep-line"></div>
      <div class="sep-diamond"></div>
      <div class="sep-line"></div>
    </div>
    <div class="section">
      {@render implicits()}
    </div>
  {/if}

  <!-- Explicit mods -->
  {#if explicits}
    <div class="separator">
      <div class="sep-line"></div>
      <div class="sep-diamond"></div>
      <div class="sep-line"></div>
    </div>
    <div class="section">
      {@render explicits()}
    </div>
  {/if}

  <!-- Footer (flavour text) -->
  {#if footer}
    <div class="separator">
      <div class="sep-line"></div>
      <div class="sep-diamond"></div>
      <div class="sep-line"></div>
    </div>
    <div class="section footer">
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .item-frame {
    display: flex;
    flex-direction: column;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--rarity-color) 8%, #0c0c14) 0%,
      #0c0c14 40%,
      color-mix(in srgb, var(--rarity-color) 4%, #0c0c14) 100%
    );
    border: 1px solid color-mix(in srgb, var(--rarity-color) 40%, transparent);
    outline: 1px solid color-mix(in srgb, var(--rarity-color) 15%, transparent);
    outline-offset: 2px;
    border-radius: var(--radius-md);
    padding: 0;
    min-width: 280px;
    max-width: 420px;
    position: relative;
    overflow: hidden;
  }

  /* Subtle inner glow along top edge */
  .item-frame::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--rarity-color) 50%, transparent) 50%,
      transparent 100%
    );
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
  }

  .icon {
    width: 36px;
    height: 36px;
    object-fit: contain;
    flex-shrink: 0;
    image-rendering: pixelated;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .item-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--rarity-color);
    line-height: 1.3;
  }

  .base-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--rarity-color);
    opacity: 0.75;
    line-height: 1.3;
  }

  .item-type {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* PoE-style separator with diamond center */
  .separator {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 var(--space-lg);
    height: 12px;
  }

  .sep-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--rarity-color) 30%, transparent) 20%,
      color-mix(in srgb, var(--rarity-color) 30%, transparent) 80%,
      transparent
    );
  }

  .sep-diamond {
    width: 6px;
    height: 6px;
    background: color-mix(in srgb, var(--rarity-color) 40%, transparent);
    transform: rotate(45deg);
    flex-shrink: 0;
    margin: 0 var(--space-xs);
  }

  .section {
    padding: var(--space-xs) var(--space-lg) var(--space-sm);
  }

  .section:last-child {
    padding-bottom: var(--space-md);
  }

  .footer {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-gold);
    font-style: italic;
    line-height: 1.5;
    opacity: 0.8;
  }
</style>
