<!--
  @component
  Game icon with first-letter fallback.
  Renders an <img> when iconUrl is available, otherwise shows the first letter of the game name.
-->
<script lang="ts">
  let {
    iconUrl,
    name,
    size = 32,
    variant = "default",
  }: {
    /** Absolute URL to the game's SVG icon. */
    iconUrl?: string;
    /** Game display name (used for alt text and first-letter fallback). */
    name: string;
    /** Icon container size in pixels. */
    size?: number;
    /** Color variant: "default" (gold), "api" (blue), or "workshop" (steam). */
    variant?: "default" | "api" | "workshop";
  } = $props();

  let imgFailed = $state(false);

  function handleError() {
    imgFailed = true;
  }

  let showImg = $derived(!!iconUrl && !imgFailed);
  let letter = $derived(name.charAt(0).toUpperCase());
</script>

<span
  class="game-icon"
  class:api={variant === "api"}
  class:workshop={variant === "workshop"}
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.round(size * 0.45)}px"
>
  {#if showImg}
    <img src={iconUrl} alt={name} width={size} height={size} onerror={handleError} />
  {:else}
    {letter}
  {/if}
</span>

<style>
  .game-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-pixel);
    color: var(--color-gold-light, #e8c86e);
    background: rgba(200, 168, 78, 0.08);
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 4px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .game-icon.api {
    color: var(--color-blue, #6b8aed);
    background: rgba(107, 138, 237, 0.08);
    border-color: rgba(107, 138, 237, 0.25);
  }

  .game-icon.workshop {
    color: var(--color-steam, #c6d4df);
    background: rgba(198, 212, 223, 0.06);
    border-color: rgba(198, 212, 223, 0.2);
  }

  .game-icon img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
