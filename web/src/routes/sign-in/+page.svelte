<!--
  @component
  Sign-in page: mounts Clerk's combined SignIn + SignUp component.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { awaitClerk } from "$lib/auth/clerk";
  import { peekPendingLinkCode } from "$lib/stores/link-code";
  import { onMount } from "svelte";

  let container: HTMLDivElement;
  let pendingCode: string | null = $state(null);

  // Mount exactly once via onMount — never via $effect.
  // Clerk's internal React tree manages its own state; any unmount/remount
  // destroys error messages, OTP input, verification state, etc.
  onMount(() => {
    pendingCode = peekPendingLinkCode();

    let unmount: (() => void) | undefined;

    void awaitClerk().then((clerk) => {
      const redirectUrl = page.url.searchParams.get("redirect_url") ?? "/";
      clerk.mountSignIn(container, {
        withSignUp: true,
        routing: "hash",
        fallbackRedirectUrl: redirectUrl,
      });
      unmount = () => clerk.unmountSignIn(container);
    });

    return () => {
      unmount?.();
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
  {#if pendingCode}
    <div class="pairing-banner">
      Pairing code <strong>{pendingCode}</strong> saved — sign in to connect your device.
    </div>
  {/if}
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

  .pairing-banner {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text);
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-gold);
    border-radius: 8px;
    padding: 12px 20px;
    text-align: center;
    animation: fade-slide-in 0.6s ease-out 0.1s both;
  }

  .auth-card {
    animation: fade-slide-in 0.6s ease-out 0.15s both;
  }
</style>
