<!--
  @component
  Full social/SEO head for a marketing page: og:title/description/url/type,
  the canonical link, and the og:image + twitter card meta. Dimensions come
  from the OG generator's own constants so the tags can never disagree with
  the rendered cards.
-->
<script lang="ts">
  import { OG_HEIGHT, OG_WIDTH } from "../../../scripts/og/cards.mjs";

  let {
    slug,
    title,
    description,
    url,
    type = "website",
  }: { slug: string; title: string; description: string; url: string; type?: string } = $props();

  const image = $derived(`https://savecraft.gg/og/${slug}.png`);
</script>

<svelte:head>
  <link rel="canonical" href={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:type" content={type} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content={String(OG_WIDTH)} />
  <meta property="og:image:height" content={String(OG_HEIGHT)} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
</svelte:head>
