<!--
  @component
  Sign-up page: mounts Clerk's SignUp component.
-->
<script lang="ts">
  import { authState, getClerk } from "$lib/auth/clerk";

  let container: HTMLDivElement | undefined = $state();

  // Mount Clerk's SignUp widget once the SDK is ready (page chrome renders immediately)
  $effect(() => {
    if (!$authState.isLoaded || !container) return;
    const clerk = getClerk();
    const el = container;
    clerk.mountSignUp(el, {
      routing: "path",
      path: "/sign-up",
      signInUrl: "/sign-in",
      afterSignUpUrl: "/devices",
    });
    return () => {
      clerk.unmountSignUp(el);
    };
  });
</script>

<div class="sign-up-page">
  <div class="hero">
    <div class="logo">SAVECRAFT</div>
  </div>
  <div class="auth-card">
    <div bind:this={container}></div>
  </div>
</div>

<style>
  .sign-up-page {
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
  }

  .auth-card {
    animation: fade-slide-in 0.6s ease-out 0.15s both;
  }
</style>
