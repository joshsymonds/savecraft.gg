<!--
  @component
  Source pairing redirect: writes the link code to localStorage and redirects to the homepage.
  The homepage reads localStorage synchronously on first render and auto-submits the linking request.
  localStorage survives cross-tab auth flows (like magic links), so the code isn't lost if the user needs to sign in.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { setPendingLinkCode } from "$lib/stores/link-code";
  import { onMount } from "svelte";

  onMount(() => {
    const code = page.params.code;
    if (code) setPendingLinkCode(code);
    void goto(resolve("/"));
  });
</script>
