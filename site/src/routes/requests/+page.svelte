<!--
  @component
  Requested Games page -- a live, public tally of games players have asked
  Savecraft to support, driven by the `request_game` MCP tool. Fetched
  client-side after hydration; the shell itself is a static prerender.
-->
<script lang="ts">
  import SocialMeta from "$lib/components/SocialMeta.svelte";
  import { PUBLIC_API_URL } from "$env/static/public";
  import { onMount } from "svelte";

  interface GameRequest {
    slug: string;
    name: string;
    count: number;
  }

  let requests = $state<GameRequest[]>([]);
  let loading = $state(true);
  let error = $state(false);

  onMount(() => {
    fetch(`${PUBLIC_API_URL}/api/v1/game-requests`)
      .then((r) => {
        if (!r.ok) throw new Error(`request failed: ${r.status}`);
        return r.json();
      })
      .then((data: { requests: GameRequest[] }) => {
        requests = data.requests;
        loading = false;
      })
      .catch(() => {
        error = true;
        loading = false;
      });
  });
</script>

<svelte:head>
  <title>Requested Games - Savecraft</title>
  <meta
    name="description"
    content="A live, transparent tally of the games players have asked Savecraft to support next."
  />
</svelte:head>

<SocialMeta
  slug="requests"
  title="Requested Games - Savecraft"
  description="A live, transparent tally of the games players have asked Savecraft to support next."
  url="https://savecraft.gg/requests"
/>

<div class="page">
  <main class="content">
    <h1 class="page-title">Requested Games</h1>
    <p class="page-subtitle">
      Players connect Savecraft to their AI and ask it to request a game. Every request is
      deduplicated per player and tallied here, in the open. Josh uses this list to decide what to
      build next.
    </p>

    {#if loading}
      <div class="status-state">
        <span class="status-text">Loading tallies&hellip;</span>
      </div>
    {:else if error}
      <div class="status-state">
        <span class="status-text">Tallies are unavailable right now.</span>
      </div>
    {:else if requests.length === 0}
      <div class="status-state">
        <span class="status-text"
          >No requests yet &mdash; be the first: ask your AI to request your game.</span
        >
      </div>
    {:else}
      <ol class="requests-list">
        {#each requests as request, index (request.slug)}
          <li class="request-row">
            <span class="request-rank">#{index + 1}</span>
            <span class="request-name">{request.name}</span>
            <span class="request-count"
              >{request.count} {request.count === 1 ? "player" : "players"}</span
            >
          </li>
        {/each}
      </ol>
    {/if}
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
  }

  .content {
    max-width: 800px;
    margin: 0 auto;
    padding: 120px 32px 80px;
  }

  .page-title {
    font-family: var(--font-pixel);
    font-size: clamp(18px, 2.5vw, 26px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 12px;
  }

  .page-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin-bottom: 32px;
  }

  .status-state {
    text-align: center;
    padding: 48px 16px;
  }

  .status-text {
    font-family: var(--font-heading);
    font-size: 17px;
    color: var(--color-text-muted);
  }

  .requests-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .request-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    padding: 16px 20px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .request-rank {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-gold);
    letter-spacing: 1px;
    flex-shrink: 0;
    width: 32px;
  }

  .request-name {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  .request-count {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .content {
      padding: 100px 20px 60px;
    }
  }
</style>
