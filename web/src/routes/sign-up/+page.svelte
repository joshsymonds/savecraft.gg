<!--
  @component
  Sign-up page: mounts Clerk's SignUp component.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getClerk } from "$lib/auth/clerk";

  let container: HTMLDivElement;

  onMount(() => {
    const clerk = getClerk();
    clerk.mountSignUp(container, {
      routing: "path",
      path: "/sign-up",
      signInUrl: "/sign-in",
      afterSignUpUrl: "/",
    });

    return () => clerk.unmountSignUp(container);
  });
</script>

<div class="sign-up-page">
  <div class="sign-up-title">SAVECRAFT</div>
  <div bind:this={container}></div>
</div>

<style>
  .sign-up-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 24px;
  }

  .sign-up-title {
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-gold);
    letter-spacing: 4px;
  }
</style>
