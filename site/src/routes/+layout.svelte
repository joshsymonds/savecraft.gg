<script lang="ts">
  import { page } from "$app/stores";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import SiteNav from "$lib/components/SiteNav.svelte";
  import "../app.css";
  import type { Snippet } from "svelte";

  let { data, children } = $props<{ data: { gameIds: string[] }; children: Snippet }>();
  let wide = $derived(
    $page.url.pathname === "/" || data.gameIds.includes($page.url.pathname.slice(1)),
  );
</script>

<SiteNav {wide} />
{@render children()}
<SiteFooter {wide} />
