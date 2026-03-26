<!--
  @component
  MCP documentation page at savecraft.gg/docs
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
</script>

<svelte:head>
  <title>Docs - Savecraft</title>
  <meta
    name="description"
    content="Connect your AI assistant to your game saves. Setup guides for Claude and ChatGPT."
  />
</svelte:head>

<article class="docs">
  <h1 class="docs-title">Documentation</h1>
  <p class="docs-subtitle">
    Connect your AI assistant to your actual game state &mdash; characters, gear, progress, and
    goals &mdash; parsed from real save files and game APIs.
  </p>

  <!-- WHAT IS SAVECRAFT -->
  <section class="section">
    <h2 class="section-title">What is Savecraft?</h2>
    <p>
      Savecraft is an MCP server that gives AI assistants access to your video game data. It works
      two ways: a local daemon watches your save files on your PC and pushes parsed game state to
      the cloud, and server-side adapters pull character data from game APIs like Battle.net. Both
      feed the same set of MCP tools, so your AI assistant sees your real characters, gear, stats,
      and progress &mdash; not hallucinated guesses.
    </p>
    <p>
      Your assistant can read your game state, search across saves and notes, run reference
      computations (like exact drop rates or stat breakpoints), and help you track goals between
      sessions using notes.
    </p>
  </section>

  <!-- CONNECT YOUR ASSISTANT -->
  <section class="section">
    <h2 class="section-title">Connect your assistant</h2>
    <p class="section-intro">
      Add Savecraft to your AI assistant. You'll sign in once and then the assistant can access your
      game data. The same URL works for every client:
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
            <strong>Success looks like:</strong> Claude responds with your game saves &mdash; character
            names, levels, builds, and stats.
          </li>
        </ol>
      </div>

      <div class="client-walkthrough">
        <h3 class="client-name">ChatGPT</h3>
        <ol class="steps">
          <li>
            Open <a href="https://chatgpt.com" class="text-link" target="_blank" rel="noopener"
              >chatgpt.com</a
            > and sign in.
          </li>
          <li>Click your profile icon in the top right, then click <strong>Settings</strong>.</li>
          <li>Click <strong>Connections</strong> in the sidebar.</li>
          <li>Click <strong>Add remote server</strong>.</li>
          <li>
            Paste this URL and click <strong>Save</strong>:
            <code class="url-block">https://mcp.savecraft.gg</code>
          </li>
          <li>
            ChatGPT will ask you to <strong>authorize Savecraft</strong>. Click Allow. You'll sign
            in to Savecraft if you aren't already.
          </li>
          <li>
            Start a new chat and ask something like: <em
              >&ldquo;What games do I have in Savecraft?&rdquo;</em
            >
          </li>
          <li class="success-step">
            <strong>Success looks like:</strong> ChatGPT responds with your game saves &mdash; character
            names, levels, builds, and stats.
          </li>
        </ol>
      </div>
    </div>

    <p class="section-note">
      You can revoke access at any time from your
      <a href={`${PUBLIC_APP_URL}/sources`} class="text-link">sources page</a>. Your AI assistant
      never sees your password &mdash; only a token that grants access to your saves and notes.
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
          <li>&ldquo;Compare my resistances &mdash; am I ready for the next difficulty?&rdquo;</li>
        </ul>
      </div>

      <div class="example-group">
        <h3 class="example-group-title">Notes &amp; planning</h3>
        <ul class="example-list">
          <li>&ldquo;Save a note with my farming goals for this week.&rdquo;</li>
          <li>&ldquo;What notes do I have on my Paladin?&rdquo;</li>
          <li>&ldquo;Update my build guide &mdash; I swapped to a different weapon.&rdquo;</li>
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
        Savecraft provides your game data &mdash; it doesn't replace the AI's general knowledge.
        Questions like &ldquo;What's the best build for a Paladin?&rdquo; or &ldquo;How do I beat
        this boss?&rdquo; use the AI's own training data, not Savecraft. Savecraft kicks in when the
        answer depends on <em>your</em> actual game state.
      </p>
    </div>
  </section>

  <!-- TOOLS REFERENCE -->
  <section class="section">
    <h2 class="section-title">Tools reference</h2>
    <p class="section-intro">
      Savecraft exposes 11 MCP tools. Your AI assistant chooses the right tool automatically based
      on your question &mdash; you don't need to call these directly.
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
            <td>Returns all your games, saves, note titles, and available reference modules.</td>
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
            <td>Requests fresh data from your source or game API.</td>
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
        </tbody>
      </table>
    </div>
  </section>

  <!-- DATA SOURCES -->
  <section class="section">
    <h2 class="section-title">How your data gets here</h2>
    <div class="source-cards">
      <div class="source-card">
        <h3 class="source-card-title">Local daemon</h3>
        <p>
          A lightweight service on your PC watches your game's save directory. When a save file
          changes, the daemon parses it with a game-specific WASM plugin and pushes structured game
          state to Savecraft over WebSocket. Supports any game with local save files.
        </p>
      </div>
      <div class="source-card">
        <h3 class="source-card-title">API adapters</h3>
        <p>
          For games with public APIs (like Battle.net), Savecraft fetches your character data
          server-side. No daemon needed &mdash; just link your game account and your data stays
          current automatically.
        </p>
      </div>
      <div class="source-card">
        <h3 class="source-card-title">Game mods</h3>
        <p>
          For moddable games, a Savecraft mod can push game state directly from inside the game. No
          daemon, no save file parsing &mdash; the mod sees everything the game knows.
        </p>
      </div>
    </div>
  </section>

  <!-- LINKS -->
  <section class="section">
    <h2 class="section-title">More</h2>
    <ul class="link-list">
      <li>
        <a href="/games" class="text-link">Supported games</a> &mdash; see what's available and what's
        coming
      </li>
      <li>
        <a href="/privacy" class="text-link">Privacy policy</a> &mdash; what we collect and why
      </li>
      <li>
        <a href="/support" class="text-link">Support</a> &mdash; Discord and email
      </li>
      <li>
        <a
          href="https://github.com/joshsymonds/savecraft.gg"
          class="text-link"
          target="_blank"
          rel="noopener">Source code</a
        > &mdash; Savecraft is open source
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
