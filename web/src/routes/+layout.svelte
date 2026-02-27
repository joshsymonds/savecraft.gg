<script lang="ts">
  import "../app.css";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { authState, getClerk, initializeClerk } from "$lib/auth/clerk";
  import { onMount } from "svelte";

  let { children } = $props();
  let userButtonEl: HTMLDivElement | undefined = $state();

  const PUBLIC_ROUTES = new Set(["/sign-in", "/sign-up"]);

  onMount(() => {
    void initializeClerk();
  });

  // Route guard: redirect to /sign-in if not authenticated and not on a public route
  $effect(() => {
    if (
      $authState.isLoaded &&
      !$authState.isSignedIn &&
      !PUBLIC_ROUTES.has(page.url.pathname)
    ) {
      void goto(resolve("/sign-up"));
    }
  });

  // Mount/unmount Clerk's UserButton when signed in
  $effect(() => {
    if ($authState.isSignedIn && userButtonEl) {
      const clerk = getClerk();
      const el = userButtonEl;
      clerk.mountUserButton(el, {
        afterSignOutUrl: "/sign-in",
      });
      return () => {
        clerk.unmountUserButton(el);
      };
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
