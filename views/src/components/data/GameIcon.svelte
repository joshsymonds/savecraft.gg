<!--
  @component
  Game icon with first-letter fallback.
  Renders an <img> when iconUrl is available, falls back to the first letter of the game name.
  Matches the web dashboard GameIcon component's visual language.
-->
<script lang="ts">
  let {
    iconUrl,
    name,
    size = 32,
  }: {
    /** URL to the game's icon (from structuredContent, not hardcoded). */
    iconUrl?: string;
    /** Game display name (used for alt text and first-letter fallback). */
    name: string;
    /** Icon container size in pixels. */
    size?: number;
  } = $props();

  let imgFailed = $state(false);

  let showImg = $derived(!!iconUrl && !imgFailed);
  let letter = $derived(name.charAt(0).toUpperCase());
</script>

<span
  class="game-icon"
  class:fallback={!showImg}
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.45)}px"
>
  {#if showImg}
    <img src={iconUrl} alt={name} width={size} height={size} onerror={() => (imgFailed = true)} />
  {:else}
    {letter}
  {/if}
</span>

<style>
  .game-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-gold) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-gold) 25%, transparent);
    flex-shrink: 0;
    overflow: hidden;
  }

  .game-icon.fallback {
    font-family: var(--font-pixel);
    color: var(--color-gold);
  }

  .game-icon img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
