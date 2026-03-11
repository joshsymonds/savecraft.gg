<!--
  @component
  Error page: shown for 404s and other unhandled errors.
  Matches the sign-in centered layout style.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
</script>

<svelte:head>
  <title>{page.status} — Savecraft</title>
</svelte:head>

<div class="error-page">
  <div class="hero">
    <div class="logo">SAVECRAFT</div>
    <div class="error-code">{page.status}</div>
    <p class="message">
      {#if page.status === 404}
        This page doesn't exist.
      {:else}
        Something went wrong.
      {/if}
    </p>
  </div>
  <a href={resolve("/")} class="home-link">Back to home</a>
</div>

<style>
  .error-page {
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
    margin-bottom: 24px;
  }

  .error-code {
    font-family: var(--font-pixel);
    font-size: 64px;
    color: var(--color-text-dim);
    margin-bottom: 16px;
  }

  .message {
    font-family: var(--font-body);
    font-size: 24px;
    color: var(--color-text);
  }

  .home-link {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-gold);
    text-decoration: none;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 10px 24px;
    border: 1px solid var(--color-gold);
    border-radius: 4px;
    transition:
      background 0.2s,
      color 0.2s;
    animation: fade-slide-in 0.6s ease-out 0.15s both;
  }

  .home-link:hover {
    background: var(--color-gold);
    color: var(--color-bg);
  }
</style>
