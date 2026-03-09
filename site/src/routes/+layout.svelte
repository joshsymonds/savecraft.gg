<script lang="ts">
  import { page } from "$app/stores";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import SiteNav from "$lib/components/SiteNav.svelte";
  import "../app.css";

  let { children } = $props();
  let wide = $derived($page.url.pathname === "/");
</script>

<SiteNav {wide} />
{@render children()}
<SiteFooter {wide} />
