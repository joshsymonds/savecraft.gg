<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { authState, getClerk, initializeClerk } from "$lib/auth/clerk";
  import { resetActivity } from "$lib/stores/activity";
  import { resetDevices } from "$lib/stores/devices";
  import { loadPlugins } from "$lib/stores/plugins";
  import { connect, disconnect } from "$lib/ws/client";
  import { handleMessage } from "$lib/ws/dispatch";
  import { onMount } from "svelte";

  let { children } = $props();
  let userButtonEl: HTMLDivElement | undefined = $state();

  const PUBLIC_ROUTES = new Set(["/sign-in", "/sign-up"]);

  /** Check Clerk's session cookie to infer auth state before the SDK loads. */
  function hasClerkSession(): boolean {
    if (!browser) return false;
    const match = document.cookie.match(/__client_uat=(\d+)/);
    return !!match && match[1] !== "0";
  }

  onMount(() => {
    void initializeClerk();
    void loadPlugins();
  });

  // Route guard: redirect unauthenticated users away from protected routes.
  // Uses the session cookie for an instant check before Clerk finishes loading.
  $effect(() => {
    if (PUBLIC_ROUTES.has(page.url.pathname)) return;
    if ($authState.isLoaded && !$authState.isSignedIn) {
      void goto(resolve("/sign-up"));
    } else if (!$authState.isLoaded && !hasClerkSession()) {
      void goto(resolve("/sign-up"));
    }
  });

  // Reverse guard: redirect authenticated users away from auth pages
  $effect(() => {
    if ($authState.isLoaded && $authState.isSignedIn && PUBLIC_ROUTES.has(page.url.pathname)) {
      void goto(resolve("/"));
    }
  });

  // WebSocket lifecycle: connect on sign-in, disconnect + reset on sign-out
  $effect(() => {
    if ($authState.isSignedIn) {
      connect(handleMessage);
      return () => {
        disconnect();
        resetDevices();
        resetActivity();
      };
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

  // Show the app shell if Clerk confirms signed-in, or optimistically if session cookie exists
  const showAppShell = $derived(
    $authState.isLoaded ? $authState.isSignedIn : hasClerkSession(),
  );
</script>

{#if PUBLIC_ROUTES.has(page.url.pathname)}
  {@render children()}
{:else if showAppShell}
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
