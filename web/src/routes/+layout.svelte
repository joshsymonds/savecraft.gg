<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { initializeClerk, authState, getClerk } from "$lib/auth/clerk";

  let { children } = $props();
  let userButtonEl: HTMLDivElement | undefined = $state();

  const PUBLIC_ROUTES = ["/sign-in", "/sign-up"];

  onMount(() => {
    initializeClerk();
  });

  // Route guard: redirect to /sign-in if not authenticated and not on a public route
  $effect(() => {
    if (
      $authState.isLoaded &&
      !$authState.isSignedIn &&
      !PUBLIC_ROUTES.includes($page.url.pathname)
    ) {
      goto("/sign-in");
    }
  });

  // Mount/unmount Clerk's UserButton when signed in
  $effect(() => {
    if ($authState.isSignedIn && userButtonEl) {
      const clerk = getClerk();
      clerk.mountUserButton(userButtonEl, {
        afterSignOutUrl: "/sign-in",
      });
      return () => clerk.unmountUserButton(userButtonEl!);
    }
  });
</script>

{#if !$authState.isLoaded}
  <div class="loading">
    <span class="loading-text">INITIALIZING...</span>
  </div>
{:else if !$authState.isSignedIn}
  {@render children()}
{:else}
  <div class="app-shell">
    <header class="app-header">
      <span class="header-title">SAVECRAFT</span>
      <div bind:this={userButtonEl}></div>
    </header>
    <div class="app-content">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }

  .loading-text {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-gold);
    letter-spacing: 3px;
    animation: fade-in 0.6s ease-out;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.15);
    background: rgba(5, 7, 26, 0.6);
  }

  .header-title {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-gold);
    letter-spacing: 3px;
  }

  .app-content {
    flex: 1;
  }
</style>
