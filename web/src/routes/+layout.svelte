<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page, updated } from "$app/state";
  import { authState, getClerk, initializeClerk } from "$lib/auth/clerk";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
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
    const match = /__client_uat=(\d+)/.exec(document.cookie);
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
    const isSignedOut = $authState.isLoaded && !$authState.isSignedIn;
    const likelySignedOut = !$authState.isLoaded && !hasClerkSession();
    if (isSignedOut || likelySignedOut) {
      void goto(resolve("/sign-in"));
    }
  });

  // Derive a stable boolean so effects below don't re-fire on every Clerk token refresh
  const isSignedIn = $derived($authState.isSignedIn);

  // WebSocket lifecycle: connect on sign-in, disconnect + reset on sign-out
  $effect(() => {
    if (isSignedIn) {
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
    if (isSignedIn && userButtonEl) {
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

  // Only show the app shell once Clerk has confirmed the user is signed in.
  // Never render protected content optimistically — a stale session cookie would flash the
  // homepage before the redirect to /sign-in fires.
  const showAppShell = $derived($authState.isLoaded && $authState.isSignedIn);
</script>

{#if PUBLIC_ROUTES.has(page.url.pathname)}
  {@render children()}
{:else if showAppShell}
  <div class="app-shell">
    <header class="app-header">
      <a href={resolve("/")} class="header-title">SAVECRAFT</a>
      <div bind:this={userButtonEl}></div>
    </header>
    {#if updated.current}
      <UpdateBanner />
    {/if}
    <div class="app-content">
      {@render children()}
    </div>
    <footer class="app-footer">
      <span class="footer-text"
        >savecraft.gg — by <a
          href="https://joshsymonds.com"
          class="footer-link"
          target="_blank"
          rel="noopener">@joshsymonds</a
        ></span
      >
      <div class="footer-links">
        <a href="https://savecraft.gg" class="footer-link">HOME</a>
        <a href="https://discord.gg/YnC8stpEmF" class="footer-link" target="_blank" rel="noopener"
          >DISCORD</a
        >
        <a
          href="https://github.com/joshsymonds/savecraft.gg"
          class="footer-link"
          target="_blank"
          rel="noopener">GITHUB</a
        >
      </div>
    </footer>
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
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
    font-size: 14px;
    color: var(--color-gold);
    letter-spacing: 3px;
    text-decoration: none;
  }

  .app-content {
    flex: 1;
    min-height: 0;
  }

  .app-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    background: rgba(5, 7, 26, 0.6);
  }

  .footer-text {
    font-family: var(--font-heading);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .footer-links {
    display: flex;
    gap: 16px;
  }

  .footer-link {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: color 0.2s;
  }

  .footer-link:hover {
    color: var(--color-border-light);
  }
</style>
