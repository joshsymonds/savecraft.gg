<!--
  @component
  Sign-in page: mounts Clerk's SignIn component.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { authState, getClerk } from "$lib/auth/clerk";

  let container: HTMLDivElement | undefined = $state();
  let mounted = false;

  // Mount Clerk's SignIn widget exactly once when the SDK is ready.
  // Must not re-run on authState changes (e.g. failed sign-in 422) or the
  // component remounts and loses its error state.
  $effect(() => {
    if (mounted || !$authState.isLoaded || !container) return;
    mounted = true;
    const clerk = getClerk();
    const el = container;
    const redirectUrl = page.url.searchParams.get("redirect_url") ?? "/";
    clerk.mountSignIn(el, {
      routing: "hash",
      fallbackRedirectUrl: redirectUrl,
    });
    return () => {
      clerk.unmountSignIn(el);
    };
  });
</script>

<svelte:head>
  <title>Sign In — Savecraft</title>
</svelte:head>

<div class="sign-in-page">
  <div class="hero">
    <div class="logo">SAVECRAFT</div>
    <p class="tagline">Connect your game saves to AI assistants.</p>
  </div>
  <div class="auth-card">
    <div bind:this={container}></div>
  </div>
</div>

<style>
  .sign-in-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 40px;
    padding: 40px 20px;
  }

  .hero {
    text-align: center;
    animation: fade-slide-in 0.6s ease-out;
  }

  .logo {
    font-family: var(--font-pixel);
    font-size: 24px;
    color: var(--color-gold);
    letter-spacing: 6px;
    margin-bottom: 12px;
  }

  .tagline {
    font-family: var(--font-body);
    font-size: 24px;
    color: var(--color-text);
  }

  .auth-card {
    animation: fade-slide-in 0.6s ease-out 0.15s both;
  }
</style>
