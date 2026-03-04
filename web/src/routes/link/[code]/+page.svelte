<!--
  @component
  Device linking redirect: captures the link code from the URL and redirects to the homepage.
  The homepage reads the pendingLinkCode store and auto-submits the linking request.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { pendingLinkCode } from "$lib/stores/link-code";
  import { onMount } from "svelte";

  onMount(() => {
    pendingLinkCode.set(page.params.code);
    void goto(resolve("/"));
  });
</script>
