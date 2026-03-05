<!--
  @component
  Source pairing redirect: writes the link code to sessionStorage and redirects to the homepage.
  The homepage reads sessionStorage synchronously on first render and auto-submits the linking request.
  sessionStorage survives auth redirects, so the code isn't lost if the user needs to sign in.
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
