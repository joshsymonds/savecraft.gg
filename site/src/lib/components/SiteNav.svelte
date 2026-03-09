<!--
  @component
  Shared site navigation bar. Used in the root layout across all pages.
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { PUBLIC_APP_URL } from "$env/static/public";
  import { onMount } from "svelte";

  interface Props {
    wide?: boolean;
  }

  let { wide = false }: Props = $props();

  // ── Auth-aware CTA ──────────────────────────────────────
  let hasSession = $state(false);

  function checkClerkSession(): boolean {
    if (!browser) return false;
    const match = /__client_uat=(\d+)/.exec(document.cookie);
    return !!match && match[1] !== "0";
  }

  let authHref = $derived(hasSession ? PUBLIC_APP_URL : `${PUBLIC_APP_URL}/sign-up`);
  let authLabel = $derived(hasSession ? "MY SAVECRAFT" : "GET STARTED");

  // ── GitHub star count ───────────────────────────────────
  let starCount = $state("");

  onMount(() => {
    hasSession = checkClerkSession();

    fetch("https://api.github.com/repos/joshsymonds/savecraft.gg")
      .then((r) => r.json())
      .then((d) => {
        const n = d?.stargazers_count;
        if (typeof n === "number" && n > 0) {
          starCount = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
        }
      })
      .catch(() => {});
  });

  let pathname = $derived($page.url.pathname);
</script>

<nav class="nav">
  <div class="nav-inner" class:wide>
    <a href="/" class="nav-left">
      <img src="/icon.png" alt="Savecraft" class="nav-icon" width="28" height="28" />
      <span class="nav-title">SAVECRAFT</span>
    </a>
    <div class="nav-right">
      <a href="/games" class="nav-link" class:active={pathname === "/games"}>GAMES</a>
      <a href="/support" class="nav-link" class:active={pathname === "/support"}>SUPPORT</a>
      <a
        href="https://discord.gg/YnC8stpEmF"
        class="nav-link nav-link-icon"
        target="_blank"
        rel="noopener"
        aria-label="Discord"
      >
        <svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor"
          ><path
            d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9 .2.2 0 00.3-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1 58.7 58.7 0 0017.7-9 .2.2 0 00.1-.2c1.4-15-2.3-28.4-9.8-40.1a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1zm23.3 0c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.7 7.1-6.3 7.1z"
          /></svg
        >
      </a>
      <a
        href="https://github.com/joshsymonds/savecraft.gg"
        class="nav-link nav-link-icon"
        target="_blank"
        rel="noopener"
        aria-label="GitHub"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          ><path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
          /></svg
        >
        {#if starCount}<span class="star-count">{starCount}</span>{/if}
      </a>
      <a href={authHref} class="nav-cta">{authLabel}</a>
    </div>
  </div>
</nav>

<style>
  .nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 0 32px;
    background: linear-gradient(180deg, rgba(5, 7, 26, 0.95), rgba(5, 7, 26, 0.6) 80%, transparent);
    backdrop-filter: blur(8px);
  }

  .nav-inner {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 0;
  }

  .nav-inner.wide {
    max-width: 1100px;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }

  .nav-icon {
    border-radius: 4px;
  }

  .nav-title {
    font-family: var(--font-pixel);
    font-size: 10px;
    color: var(--color-text);
    letter-spacing: 2px;
  }

  .nav-right {
    display: flex;
    gap: 20px;
    align-items: center;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-dim);
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: color 0.2s;
  }

  .nav-link:hover,
  .nav-link.active {
    color: var(--color-gold-light);
  }

  .nav-link-icon {
    gap: 4px;
  }

  .star-count {
    font-family: var(--font-heading);
    font-size: 12px;
    font-weight: 600;
    color: inherit;
  }

  .nav-cta {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: #05071a;
    background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light));
    padding: 8px 18px;
    border-radius: 2px;
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: all 0.2s;
    box-shadow: 0 0 12px rgba(200, 168, 78, 0.25);
  }

  .nav-cta:hover {
    box-shadow: 0 0 20px rgba(200, 168, 78, 0.45);
    transform: translateY(-1px);
  }

  @media (max-width: 600px) {
    .nav-link:not(.nav-link-icon) {
      display: none;
    }

    .nav-right {
      gap: 16px;
    }
  }
</style>
