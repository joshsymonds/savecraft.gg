<!--
  @component
  Sign-in page: mounts Clerk's SignIn component.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getClerk } from "$lib/auth/clerk";

  let container: HTMLDivElement;

  onMount(() => {
    const clerk = getClerk();
    clerk.mountSignIn(container, {
      routing: "path",
      path: "/sign-in",
      signUpUrl: "/sign-up",
      afterSignInUrl: "/",
    });

    return () => clerk.unmountSignIn(container);
  });
</script>

<div class="sign-in-page">
  <div class="sign-in-title">SAVECRAFT</div>
  <div bind:this={container}></div>
</div>

<style>
  .sign-in-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 24px;
  }

  .sign-in-title {
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-gold);
    letter-spacing: 4px;
  }
</style>
