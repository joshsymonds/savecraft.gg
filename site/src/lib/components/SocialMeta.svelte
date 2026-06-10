<!--
  @component
  og:image + twitter card meta for a marketing page. Dimensions come from
  the OG generator's own constants so the tags can never disagree with the
  rendered cards.
-->
<script lang="ts">
  import { OG_HEIGHT, OG_WIDTH } from "../../../scripts/og/cards.mjs";

  let { slug }: { slug: string } = $props();

  const image = $derived(`https://savecraft.gg/og/${slug}.png`);
</script>

<svelte:head>
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content={String(OG_WIDTH)} />
  <meta property="og:image:height" content={String(OG_HEIGHT)} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={image} />
</svelte:head>
