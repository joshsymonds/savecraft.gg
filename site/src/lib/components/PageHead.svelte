<!--
  @component
  Complete head for a plain WebPage-shaped marketing page: <title>,
  meta description, WebPage JSON-LD, and the full SocialMeta set --
  one component so the three strings can't drift apart across tags.
  Pages with bespoke JSON-LD shapes (home, games, game pages) compose
  SocialMeta and jsonLd directly instead.
-->
<script lang="ts">
  import { jsonLd } from "$lib/jsonld";

  import SocialMeta from "./SocialMeta.svelte";

  let {
    slug,
    title,
    description,
    url,
  }: { slug: string; title: string; description: string; url: string } = $props();
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of static data, escaped in jsonLd() -->
  {@html jsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url,
    description,
  })}
</svelte:head>

<SocialMeta {slug} {title} {description} {url} />
