<!--
  @component
  MCP documentation page at savecraft.gg/docs
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
  import { SOURCE_KINDS, URLS } from "@savecraft/content/facts";
  import PageHead from "$lib/components/PageHead.svelte";

  const howGameConnectsCards = [
    { title: "Reference, instantly", body: SOURCE_KINDS.reference.shortDescription },
    { title: "Your account", body: SOURCE_KINDS.api.shortDescription },
    {
      title: "Your save files or a mod",
      body:
        SOURCE_KINDS.wasm.shortDescription +
        " " +
        SOURCE_KINDS.mod_selfpush.shortDescription +
        " Some moddable games (like Factorio) pair the mod with the Savecraft daemon instead; adding the game walks you through whichever fits.",
    },
  ];
</script>

<PageHead
  slug="docs"
  title="Docs - Savecraft"
  description="How Savecraft works: add a game and your AI gets real, current data for it -- plus your live game state, where the game supports it. Setup guides for Claude and ChatGPT."
  url="https://savecraft.gg/docs"
/>

<article class="docs">
  <h1 class="docs-title">Documentation</h1>
  <p class="docs-subtitle">
    Add a game. Your AI gets real, current data for it -- and your live game state, where the game
    supports it.
  </p>

  <!-- WHAT IS SAVECRAFT -->
  <section class="section">
    <h2 class="section-title">What is Savecraft?</h2>
    <p>
      Savecraft is an MCP server that gives AI assistants real data for the games you add. You
      connect your assistant once, then add the games you play. Your assistant sees your actual
      characters and the actual rules behind them.
    </p>
    <p>
      Reference data works the second a game is on your list, current to the latest patch. Connect a
      game's account (Path of Exile, World of Warcraft) or add it on the machine you play it on, and
      your live characters and saves come along too. From there your AI knows your build, your gear,
      and what you're working toward between sessions.
    </p>
  </section>

  <!-- CONNECT YOUR ASSISTANT -->
  <section class="section">
    <h2 class="section-title">Connect your assistant</h2>
    <p class="section-intro">
      Add Savecraft to your AI assistant. You'll sign in once and then the assistant can access your
      game data. ChatGPT installs in one click via the app directory; Claude takes a few seconds
      with this URL:
    </p>
    <code class="url-block">https://mcp.savecraft.gg</code>

    <div class="client-walkthroughs">
      <div class="client-walkthrough">
        <h3 class="client-name">Claude.ai</h3>
        <ol class="steps">
          <li>
            Open <a href="https://claude.ai" class="text-link" target="_blank" rel="noopener"
              >claude.ai</a
            > and sign in.
          </li>
          <li>Click your profile icon in the lower left, then click <strong>Settings</strong>.</li>
          <li>Click <strong>Connectors</strong> in the sidebar.</li>
          <li>Click <strong>Add Custom Connector</strong>.</li>
          <li>
            Paste this URL and click <strong>Save</strong>:
            <code class="url-block">https://mcp.savecraft.gg</code>
          </li>
          <li>
            Claude will ask you to <strong>authorize Savecraft</strong>. Click Allow. You'll sign in
            to Savecraft if you aren't already.
          </li>
          <li>
            Go back to a chat and ask something like: <em
              >&ldquo;What games do I have in Savecraft?&rdquo;</em
            >
          </li>
          <li class="success-step">
            <strong>Success looks like:</strong> Claude responds with your game saves -- character names,
            levels, builds, and stats.
          </li>
        </ol>
      </div>

      <div class="client-walkthrough">
        <h3 class="client-name">ChatGPT</h3>
        <ol class="steps">
          <li>
            Open the Savecraft app on ChatGPT:
            <a
              href="https://chatgpt.com/apps/savecraft/asdk_app_69bf076444388191b92e9c482184b44c"
              class="text-link"
              target="_blank"
              rel="noopener">chatgpt.com/apps/savecraft</a
            >
          </li>
          <li>
            Click <strong>Connect</strong> in the upper right. You'll sign in to Savecraft if you aren't
            already, then authorize the app.
          </li>
          <li>
            Start a new chat and ask something like: <em
              >&ldquo;What games do I have in Savecraft?&rdquo;</em
            >
          </li>
          <li class="success-step">
            <strong>Success looks like:</strong> ChatGPT responds with your game saves -- character names,
            levels, builds, and stats.
          </li>
        </ol>
      </div>
    </div>

    <p class="section-note">
      Revoke access whenever you want: remove the Savecraft connector from Claude's or ChatGPT's own
      settings, or open your
      <a href={PUBLIC_APP_URL} class="text-link">Savecraft dashboard</a> to disconnect a game or unpair
      a computer. Your AI assistant never sees your password -- only a token that grants access to your
      games and notes.
    </p>
  </section>

  <!-- WHAT YOU CAN DO -->
  <section class="section">
    <h2 class="section-title">What you can do</h2>
    <p class="section-intro">
      Here are examples of things you can ask your AI assistant once Savecraft is connected.
    </p>

    <div class="examples">
      <div class="example-group">
        <h3 class="example-group-title">Game state</h3>
        <ul class="example-list">
          <li>&ldquo;What level is my character and what difficulty am I on?&rdquo;</li>
          <li>&ldquo;Show me what gear my character has equipped.&rdquo;</li>
          <li>&ldquo;What skills do I have allocated?&rdquo;</li>
          <li>&ldquo;Compare my resistances -- am I ready for the next difficulty?&rdquo;</li>
        </ul>
      </div>

      <div class="example-group">
        <h3 class="example-group-title">Notes &amp; planning</h3>
        <ul class="example-list">
          <li>&ldquo;Save a note with my farming goals for this week.&rdquo;</li>
          <li>&ldquo;What notes do I have on my Paladin?&rdquo;</li>
          <li>&ldquo;Update my build guide -- I swapped to a different weapon.&rdquo;</li>
        </ul>
      </div>

      <div class="example-group">
        <h3 class="example-group-title">Reference data</h3>
        <ul class="example-list">
          <li>&ldquo;What are the exact drop rates for this item with my magic find?&rdquo;</li>
          <li>&ldquo;Calculate the stat breakpoints I need to hit.&rdquo;</li>
        </ul>
      </div>

      <div class="example-group">
        <h3 class="example-group-title">Search</h3>
        <ul class="example-list">
          <li>&ldquo;Search my saves for anything related to swords.&rdquo;</li>
          <li>&ldquo;Do any of my notes mention farming routes?&rdquo;</li>
        </ul>
      </div>
    </div>

    <div class="not-examples">
      <h3 class="not-examples-title">What Savecraft doesn't do</h3>
      <p>
        Savecraft provides your game data. Questions like &ldquo;What's the best build for a
        Paladin?&rdquo; or &ldquo;How do I beat this boss?&rdquo; draw on the AI's own training
        data. Savecraft kicks in when the answer depends on <em>your</em> actual game state.
      </p>
    </div>
  </section>

  <!-- TOOLS REFERENCE -->
  <section class="section">
    <h2 class="section-title">Tools reference</h2>
    <p class="section-intro">
      Savecraft's MCP server exposes the tools below. Your AI assistant picks the right one
      automatically based on your question -- you don't need to call these directly.
    </p>

    <div class="tools-table-wrap">
      <table class="tools-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>list_games</code></td>
            <td>Returns all your games, saves, note titles, and available expert modules.</td>
          </tr>
          <tr>
            <td><code>get_save</code></td>
            <td>Gets a save's summary, overview, available sections, and attached notes.</td>
          </tr>
          <tr>
            <td><code>get_section</code></td>
            <td>Fetches detailed section data from a save (gear, skills, stats, etc.).</td>
          </tr>
          <tr>
            <td><code>get_note</code></td>
            <td>Fetches the full content of a note.</td>
          </tr>
          <tr>
            <td><code>create_note</code></td>
            <td>Creates a note attached to a save.</td>
          </tr>
          <tr>
            <td><code>update_note</code></td>
            <td>Updates a note's title or content.</td>
          </tr>
          <tr>
            <td><code>delete_note</code></td>
            <td>Permanently deletes a note.</td>
          </tr>
          <tr>
            <td><code>refresh_save</code></td>
            <td
              >Pulls the latest data for a save -- re-reads the save file or refetches from the
              game's API.</td
            >
          </tr>
          <tr>
            <td><code>search_saves</code></td>
            <td>Full-text search across all saves and notes.</td>
          </tr>
          <tr>
            <td><code>query_reference</code></td>
            <td>Runs a reference computation (drop rates, stat calculations, breakpoints).</td>
          </tr>
          <tr>
            <td><code>setup_help</code></td>
            <td>Returns setup help, privacy info, or project details.</td>
          </tr>
          <tr>
            <td><code>show_reference</code></td>
            <td
              >Like query_reference, but also renders the result as an interactive view in the
              assistant's UI (when the module supports it).</td
            >
          </tr>
          <tr>
            <td><code>show_games</code></td>
            <td>Like list_games, but renders an interactive games browser in the assistant's UI.</td
            >
          </tr>
          <tr>
            <td><code>show_save</code></td>
            <td>Like get_save, but renders an interactive save dashboard in the assistant's UI.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- HOW A GAME CONNECTS -->
  <section class="section">
    <h2 class="section-title">How a game connects</h2>
    <p class="section-intro">
      How a game connects depends on the game itself. The three cards below show what adding a game
      looks like in each case.
    </p>
    <div class="source-cards">
      {#each howGameConnectsCards as card (card.title)}
        <div class="source-card">
          <h3 class="source-card-title">{card.title}</h3>
          <p>{card.body}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- LINKS -->
  <section class="section">
    <h2 class="section-title">More</h2>
    <ul class="link-list">
      <li>
        <a href="/games" class="text-link">Supported games</a> -- see what's available and what's coming
      </li>
      <li>
        <a href="/privacy" class="text-link">Privacy policy</a> -- what we collect and why
      </li>
      <li>
        <a href="/support" class="text-link">Support</a> -- Discord and email
      </li>
      <li>
        <a href={URLS.github} class="text-link" target="_blank" rel="noopener">Source code</a> -- Savecraft
        is open source
      </li>
    </ul>
  </section>
</article>

<style>
  /* -- Docs content -- */
  .docs {
    max-width: 800px;
    margin: 0 auto;
    padding: 120px 32px 80px;
  }

  .docs-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 8px;
  }

  .docs-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    margin-bottom: 48px;
  }

  /* -- Sections -- */
  .section {
    margin-bottom: 56px;
  }

  .section-title {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-gold);
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }

  .section-intro {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    margin-bottom: 20px;
  }

  .section p {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    margin-bottom: 12px;
  }

  /* -- Client setup walkthroughs -- */
  .client-walkthroughs {
    display: flex;
    flex-direction: column;
    gap: 28px;
    margin-top: 24px;
  }

  .client-walkthrough {
    padding: 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .client-name {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }

  .steps {
    list-style: decimal;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }

  .steps li {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
  }

  .steps li strong {
    color: var(--color-text);
  }

  .steps li em {
    color: var(--color-gold-light, var(--color-gold));
    font-style: italic;
  }

  .success-step {
    padding: 10px 14px;
    background: rgba(90, 190, 138, 0.06);
    border-left: 3px solid var(--color-green);
    border-radius: 0 4px 4px 0;
    margin-top: 4px;
  }

  .section-note {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-muted);
    line-height: 1.7;
    margin-top: 20px;
  }

  .url-block {
    display: block;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-green);
    background: rgba(5, 7, 26, 0.6);
    padding: 10px 14px;
    border-radius: 2px;
    margin-bottom: 10px;
    word-break: break-all;
  }

  /* -- Examples -- */
  .examples {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 28px;
  }

  .example-group-title {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .example-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .example-list li {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    padding: 4px 0;
    padding-left: 16px;
    position: relative;
  }

  .example-list li::before {
    content: "\203A";
    position: absolute;
    left: 0;
    color: var(--color-gold);
  }

  .not-examples {
    padding: 20px 24px;
    background: rgba(5, 7, 26, 0.4);
    border-left: 3px solid var(--color-border);
    border-radius: 0 4px 4px 0;
  }

  .not-examples-title {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .not-examples p {
    font-family: var(--font-heading);
    font-size: 15px;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin-bottom: 0;
  }

  /* -- Tools table -- */
  .tools-table-wrap {
    overflow-x: auto;
  }

  .tools-table {
    width: 100%;
    border-collapse: collapse;
  }

  .tools-table th {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-align: left;
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-border);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .tools-table td {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    padding: 12px 16px;
    border-bottom: 1px solid rgba(74, 90, 173, 0.1);
    vertical-align: top;
  }

  .tools-table td code {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-green);
    white-space: nowrap;
  }

  .tools-table tr:last-child td {
    border-bottom: none;
  }

  /* -- Source cards -- */
  .source-cards {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }

  .source-card {
    padding: 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .source-card-title {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 10px;
    letter-spacing: 0.5px;
  }

  .source-card p {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin-bottom: 0;
  }

  /* -- Links -- */
  .text-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .text-link:hover {
    border-color: var(--color-gold);
  }

  .link-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .link-list li {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    padding: 6px 0;
  }

  /* -- Responsive -- */
  @media (max-width: 700px) {
    .docs {
      padding: 100px 20px 60px;
    }

    .examples {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .source-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
