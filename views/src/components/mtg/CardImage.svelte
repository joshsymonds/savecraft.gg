<!--
  @component
  Full MTG card image hotlinked from Scryfall (cards.scryfall.io).
  Renders nothing when the id is malformed or the image fails to load —
  callers should keep their existing text-only layout as the fallback.
-->
<script lang="ts">
  import { cardImageUrl } from "./scryfall";

  interface Props {
    /** Scryfall card ID (36-char UUID) used to build the image URL. */
    scryfallId: string;
    /** Card name, used as the img alt text. */
    name: string;
    /** Image size variant (default: "normal"). */
    size?: "small" | "normal" | "large";
    /** Called when the id is malformed or the image fails to load. */
    onfallback?: () => void;
  }

  let { scryfallId, name, size = "normal", onfallback }: Props = $props();

  let url = $derived(cardImageUrl(scryfallId, size));
  let failed = $state(false);

  function handleError() {
    failed = true;
    onfallback?.();
  }
</script>

{#if url && !failed}
  <img class="card-image" src={url} alt={name} loading="lazy" onerror={handleError} />
{/if}

<style>
  .card-image {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius-md);
    animation: fade-in 420ms ease-out both;
  }
</style>
