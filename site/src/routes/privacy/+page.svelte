<!--
  @component
  Privacy policy page — rendered from PRIVACY.md content at savecraft.gg/privacy
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
</script>

<svelte:head>
  <title>Privacy Policy - Savecraft</title>
  <meta
    name="description"
    content="Savecraft privacy policy. What we collect, why, and what we don't."
  />
</svelte:head>

<div class="page">
  <!-- ═══ NAV ═══ -->
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-left">
        <img src="/icon.png" alt="Savecraft" class="nav-icon" width="28" height="28" />
        <span class="nav-title">SAVECRAFT</span>
      </a>
      <div class="nav-right">
        <a href={`${PUBLIC_APP_URL}/sign-up`} class="nav-cta">GET STARTED</a>
      </div>
    </div>
  </nav>

  <!-- ═══ CONTENT ═══ -->
  <article class="privacy">
    <h1 class="privacy-title">Privacy Policy</h1>
    <p class="privacy-updated">Last updated: March 4, 2026</p>

    <div class="privacy-tldr">
      <strong>TL;DR:</strong> Savecraft collects the minimum data needed to connect your game saves
      to AI assistants. We store your email address, your game save data (which you push to us), and
      notes you create. We do not run analytics, do not track you, do not sell your data, and do not
      see your conversations with AI assistants. Our code is
      <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link">open source</a> — you can
      verify all of this yourself.
    </div>

    <section class="privacy-section">
      <h2>Who we are</h2>
      <p>Savecraft is operated by Josh Symonds ("we," "us," "our").</p>
      <p>
        <strong>General contact:</strong>
        <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a><br />
        <strong>Privacy contact:</strong>
        <a href="mailto:privacy@savecraft.gg" class="text-link">privacy@savecraft.gg</a>
      </p>
      <p>
        Savecraft is a gaming companion tool that parses your game save files and serves structured
        game state data to AI assistants (Claude, ChatGPT, Gemini) via the Model Context Protocol
        (MCP). It consists of a local daemon that runs on your gaming device, a cloud service that
        stores and serves your data, and a web interface for managing your devices and settings.
      </p>
      <p>
        This policy applies to the hosted service at <strong>savecraft.gg</strong> and the Savecraft daemon
        software. If you self-host Savecraft from our open-source repository, your deployment is governed
        by your own privacy practices, not this policy.
      </p>
    </section>

    <section class="privacy-section">
      <h2>What we collect and why</h2>
      <p>
        We collect only what's necessary to provide the service. Here is everything, with nothing
        omitted:
      </p>

      <h3>Account data</h3>
      <p>
        When you create an account, we collect your <strong>email address</strong> and
        <strong>display name</strong> through our authentication provider, Clerk. We use this to identify
        your account and display which account your devices are linked to.
      </p>
      <p class="legal-basis">
        <strong>Legal basis (GDPR):</strong> Contract performance — you provide this to create and use
        your account.
      </p>
      <p class="retention"><strong>Retention:</strong> Until you delete your account.</p>

      <h3>Device data</h3>
      <p>
        When you link a gaming device, the daemon registers with our server and reports its
        <strong>hostname</strong> (e.g., "steam-deck"), <strong>operating system</strong> (e.g.,
        "linux"), and <strong>architecture</strong> (e.g., "arm64"). A device-specific authentication
        token is generated; we store only a SHA-256 hash of this token, never the token itself.
      </p>
      <p class="legal-basis">
        <strong>Legal basis:</strong> Contract performance — device identification is required for the
        daemon to push save data.
      </p>
      <p class="retention">
        <strong>Retention:</strong> Until you unlink the device, plus a 7-day cleanup period.
      </p>

      <h3>API keys</h3>
      <p>
        You can generate API keys for programmatic access. We store a <strong>SHA-256 hash</strong> of
        each key, a short prefix for identification (e.g., "sk_...abc"), and a label you provide. The
        full key is shown to you once at creation and is never stored.
      </p>
      <p class="legal-basis"><strong>Legal basis:</strong> Contract performance.</p>
      <p class="retention"><strong>Retention:</strong> Until you delete the key or your account.</p>

      <h3>Game save data</h3>
      <p>
        This is the core of the service. When the daemon detects a save file change, it parses the
        file locally on your device, converts it to structured JSON (character stats, gear, skills,
        quest progress — whatever the game plugin extracts), and pushes that JSON to our cloud. We
        store every snapshot as an immutable record so you can track changes over time.
      </p>
      <p>
        The daemon reads your save files in <strong>read-only</strong> mode. It cannot modify your saves.
        The raw save file never leaves your device — only the parsed JSON output is transmitted.
      </p>
      <p class="legal-basis">
        <strong>Legal basis:</strong> Contract performance — serving your game state to AI assistants
        is the entire service.
      </p>
      <p class="retention">
        <strong>Retention:</strong> All snapshots are currently retained for the life of your account.
        We may introduce time-based thinning in the future (e.g., keeping daily snapshots for a month,
        then weekly) and will update this policy before doing so.
      </p>

      <h3>Notes</h3>
      <p>
        You (or an AI assistant acting on your behalf during conversation) can create notes attached
        to your saves — build guides, farming goals, session reminders. Notes are user-authored
        markdown stored alongside your save data.
      </p>
      <p class="legal-basis"><strong>Legal basis:</strong> Contract performance.</p>
      <p class="retention"><strong>Retention:</strong> Until you delete them.</p>

      <h3>Authentication and session data</h3>
      <p>
        When you connect an AI assistant via MCP, the OAuth handshake creates client registrations,
        authorization codes, and access tokens. These are stored in Cloudflare KV with automatic
        expiration (TTL-managed). A single-column record tracks whether you've connected an MCP
        client, used to show connection status in the web UI.
      </p>
      <p class="legal-basis">
        <strong>Legal basis:</strong> Contract performance (MCP authentication is required for the service
        to function).
      </p>
      <p class="retention">
        <strong>Retention:</strong> Tokens expire automatically per their TTL. The MCP activity flag persists
        until your account is deleted.
      </p>

      <h3>Device status events</h3>
      <p>
        The daemon reports operational status (online/offline, parse success/failure, push status)
        to power the real-time activity feed in the web UI. We retain the last 100 events per
        device.
      </p>
      <p class="legal-basis">
        <strong>Legal basis:</strong> Legitimate interest — operational monitoring helps you verify your
        daemon is working and helps us debug issues.
      </p>
      <p class="retention">
        <strong>Retention:</strong> Rolling window of 100 events per device, pruned on insert.
      </p>
    </section>

    <section class="privacy-section">
      <h2>What we do NOT collect</h2>
      <p>This matters as much as what we do collect:</p>
      <ul>
        <li>
          <strong>No analytics or telemetry.</strong> No Google Analytics, no Posthog, no tracking pixels,
          no third-party scripts.
        </li>
        <li>
          <strong>No IP addresses.</strong> Cloudflare sees IP addresses at the network edge, but our
          application code never reads, stores, or logs them.
        </li>
        <li>
          <strong>No conversation history.</strong> We never see what you say to Claude, ChatGPT, or Gemini.
          The AI assistant requests specific data from us (e.g., "get this character's equipped gear"),
          and we return structured JSON. The conversation itself stays entirely between you and the AI
          provider.
        </li>
        <li>
          <strong>No device fingerprinting.</strong> We do not collect User-Agent strings, screen dimensions,
          installed fonts, or any browser fingerprint data.
        </li>
        <li>
          <strong>No behavioral tracking.</strong> No click tracking, session recording, heatmaps, or
          funnel analysis.
        </li>
      </ul>
    </section>

    <section class="privacy-section">
      <h2>How data flows through MCP</h2>
      <p>
        This is worth explaining clearly because it's a new kind of data flow that most privacy
        policies don't address.
      </p>
      <p>
        When you connect an AI assistant to Savecraft, the assistant can use our MCP tools to
        request your game data. A typical interaction looks like this: you ask the AI a question
        about your character, the AI calls our <code>get_section</code> tool with your save ID, we return
        the requested JSON data (e.g., your equipped gear), and the AI uses that data to answer your question.
      </p>
      <p>
        We serve data to the AI assistant <strong
          >on your behalf and under your authorization.</strong
        >
        We do not control what the AI provider does with the data after receiving it — that is governed
        by your agreement with the AI provider (Anthropic, OpenAI, Google, etc.). We do not cache requests
        from AI providers, and we do not retain logs of which tools are called or what data is returned.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Cookies</h2>
      <p>Savecraft uses a single cookie:</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Cookie</th><th>Provider</th><th>Purpose</th><th>Duration</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><code>__client_uat</code></td>
              <td>Clerk</td>
              <td>Authentication session management</td>
              <td>Session</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        This cookie is <strong>strictly necessary</strong> for the service to function (it keeps you logged
        in) and is exempt from consent requirements under the ePrivacy Directive. We do not use any analytics,
        advertising, or tracking cookies. No cookie consent banner is needed or shown because there are
        no optional cookies to consent to.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Who has access to your data</h2>
      <p>We name every third party, what they receive, and why.</p>

      <h3>Cloudflare</h3>
      <p><strong>Role:</strong> Infrastructure provider (data processor under GDPR).</p>
      <p>
        <strong>What they process:</strong> All application data — save snapshots, account metadata, notes,
        authentication tokens, device events. Cloudflare Workers execute your API requests; R2 stores
        save snapshots; D1 (SQLite) stores account and device metadata, notes, and the search index; KV
        stores OAuth tokens.
      </p>
      <p>
        <strong>Data location:</strong> Your data is stored and processed on Cloudflare's global network,
        including in the United States.
      </p>
      <p>
        <strong>Transfer safeguards:</strong> Cloudflare is certified under the EU-U.S. Data Privacy Framework
        and incorporates EU Standard Contractual Clauses in its Data Processing Addendum, which applies
        automatically to all customers.
      </p>
      <p>
        <strong>Their privacy policy:</strong>
        <a href="https://www.cloudflare.com/privacypolicy/" class="text-link"
          >cloudflare.com/privacypolicy</a
        >
      </p>

      <h3>Clerk</h3>
      <p>
        <strong>Role:</strong> Authentication provider (data processor for authentication services; independent
        data controller for its own account management).
      </p>
      <p>
        <strong>What they receive:</strong> Your email address, display name, and authentication credentials
        (hashed). Clerk also processes session data and device metadata as part of authentication.
      </p>
      <p><strong>Data location:</strong> United States (Google Cloud Platform).</p>
      <p>
        <strong>Transfer safeguards:</strong> Clerk is certified under the EU-U.S. Data Privacy
        Framework and offers a DPA with Standard Contractual Clauses at
        <a href="https://clerk.com/legal/dpa" class="text-link">clerk.com/legal/dpa</a>.
      </p>
      <p>
        <strong>Their privacy policy:</strong>
        <a href="https://clerk.com/legal/privacy" class="text-link">clerk.com/legal/privacy</a>
      </p>

      <h3>Stripe (future)</h3>
      <p>
        When we add paid subscriptions, Stripe will process payments. Stripe will receive your
        payment card details, billing address, and transaction data directly — we will not store
        payment information ourselves. Stripe acts as both a data processor (handling transactions
        on our behalf) and an independent data controller (for fraud prevention and regulatory
        compliance). We will update this policy before adding Stripe.
      </p>

      <p>
        <strong>No other third parties have access to your data.</strong> We do not use advertising networks,
        data brokers, marketing platforms, or social media integrations.
      </p>
    </section>

    <section class="privacy-section">
      <h2>International data transfers</h2>
      <p>
        If you are in the EU/EEA or UK, your data is transferred to and processed in the United
        States and potentially other countries where Cloudflare operates edge infrastructure. These
        transfers are protected by:
      </p>
      <ul>
        <li>
          The <strong>EU-U.S. Data Privacy Framework</strong> adequacy decision (European Commission,
          July 10, 2023), under which both Cloudflare and Clerk are certified.
        </li>
        <li>
          <strong>EU Standard Contractual Clauses</strong> (Commission Decision 2021/914) incorporated
          into both Cloudflare's and Clerk's data processing agreements, as a fallback mechanism.
        </li>
        <li>
          The <strong>UK International Data Transfer Addendum</strong> for UK-originating data.
        </li>
      </ul>
    </section>

    <section class="privacy-section">
      <h2>Your rights</h2>

      <h3>Everyone</h3>
      <p>
        You can request a copy of all data we hold about you, ask us to correct inaccurate data, or
        delete your account and all associated data by emailing
        <a href="mailto:privacy@savecraft.gg" class="text-link">privacy@savecraft.gg</a>. You can
        also delete individual saves, notes, and devices directly through the web UI or MCP tools at
        any time.
      </p>

      <h3>EU/EEA and UK residents</h3>
      <p>Under GDPR, you have the right to:</p>
      <ul>
        <li><strong>Access</strong> your personal data and receive a copy in a portable format</li>
        <li><strong>Rectify</strong> inaccurate or incomplete data</li>
        <li><strong>Erase</strong> your data ("right to be forgotten")</li>
        <li><strong>Restrict</strong> processing in certain circumstances</li>
        <li><strong>Object</strong> to processing based on legitimate interest</li>
        <li>
          <strong>Data portability</strong> — receive your data in a structured, machine-readable format
          (your game state is already structured JSON)
        </li>
        <li>
          <strong>Lodge a complaint</strong> with your local data protection supervisory authority
        </li>
      </ul>
      <p>
        We respond to all data rights requests within <strong>one month</strong>. If a request is
        complex, we may extend this by up to two additional months with notice. Requests are free of
        charge.
      </p>
      <p>
        We do not have a Data Protection Officer, as our processing activities do not involve
        large-scale systematic monitoring or special category data. For any privacy concerns,
        contact us directly at
        <a href="mailto:privacy@savecraft.gg" class="text-link">privacy@savecraft.gg</a>.
      </p>

      <h3>California residents</h3>
      <p>
        We do not currently meet the applicability thresholds of the California Consumer Privacy Act
        (CCPA/CPRA). Regardless, we voluntarily state: <strong
          >we do not sell or share your personal information</strong
        > as defined under California law, and we have never done so. If the CCPA becomes applicable to
        us, we will update this policy with the required disclosures.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Children's privacy</h2>
      <p>
        Savecraft is not directed at children under 13. We do not knowingly collect personal
        information from children under 13. If you are under 13, please do not use Savecraft or
        provide any information to us. If we learn that we have collected personal information from
        a child under 13, we will delete that data promptly. If you believe a child under 13 has
        provided us with personal information, please contact us at
        <a href="mailto:privacy@savecraft.gg" class="text-link">privacy@savecraft.gg</a>.
      </p>
      <p>
        In EU member states where the age of digital consent is higher than 13, users below that age
        require parental or guardian consent to use the service.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Data security</h2>
      <p>
        Save data and notes are stored in Cloudflare's infrastructure, which provides encryption at
        rest and in transit. Authentication tokens are hashed (SHA-256 for device tokens; bcrypt for
        Clerk credentials). OAuth tokens are opaque and stored with automatic expiration. The daemon
        runs with minimal system permissions — on Linux/Steam Deck, kernel-enforced sandboxing (via
        systemd) restricts it to read-only access to save file directories and write access only to
        its own configuration. WASM plugins that parse save files are sandboxed and cannot access
        the filesystem, network, or environment variables.
      </p>
      <p>
        Our source code is publicly available. You can inspect exactly what data the daemon
        collects, how plugins parse saves, and how the server handles requests.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Changes to this policy</h2>
      <p>
        We will update this policy when our data practices change. For material changes — new data
        collection, new third-party services, changes to retention periods — we will notify you via
        email and/or a prominent notice on savecraft.gg at least 30 days before the changes take
        effect. For minor clarifications or formatting changes, we will update the "Last updated"
        date at the top.
      </p>
      <p>
        Previous versions of this policy will be available in our
        <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link"
          >public Git repository</a
        >.
      </p>
    </section>

    <section class="privacy-section">
      <h2>Contact</h2>
      <p>For any privacy-related questions, concerns, or data rights requests:</p>
      <p>
        <strong>Email:</strong>
        <a href="mailto:privacy@savecraft.gg" class="text-link">privacy@savecraft.gg</a>
      </p>
      <p>
        We aim to respond to all inquiries within 5 business days and to all formal data rights
        requests within one month.
      </p>
    </section>
  </article>

  <!-- ═══ FOOTER ═══ -->
  <footer class="footer">
    <span class="footer-text"
      >savecraft.gg — by <a
        href="https://joshsymonds.com"
        class="footer-link"
        target="_blank"
        rel="noopener">@joshsymonds</a
      ></span
    >
    <div class="footer-links">
      <a href="/privacy" class="footer-link">PRIVACY</a>
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

<style>
  .page {
    min-height: 100vh;
  }

  /* ── Nav (same as homepage) ──────────────────────────────── */
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
    gap: 24px;
    align-items: center;
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

  /* ── Privacy content ─────────────────────────────────────── */
  .privacy {
    max-width: 800px;
    margin: 0 auto;
    padding: 120px 32px 80px;
  }

  .privacy-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 8px;
  }

  .privacy-updated {
    font-family: var(--font-heading);
    font-size: 15px;
    color: var(--color-text-muted);
    margin-bottom: 32px;
  }

  .privacy-tldr {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text);
    line-height: 1.7;
    padding: 20px 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    margin-bottom: 48px;
  }

  .privacy-section {
    margin-bottom: 40px;
  }

  .privacy-section h2 {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-gold);
    margin-bottom: 16px;
    letter-spacing: 0.5px;
  }

  .privacy-section h3 {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
    margin-top: 24px;
    margin-bottom: 12px;
    letter-spacing: 0.5px;
  }

  .privacy-section p {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    margin-bottom: 12px;
  }

  .privacy-section ul {
    list-style: none;
    padding: 0;
    margin-bottom: 16px;
  }

  .privacy-section li {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    padding-left: 20px;
    position: relative;
    margin-bottom: 8px;
  }

  .privacy-section li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 10px;
    width: 6px;
    height: 6px;
    background: var(--color-border);
    border-radius: 1px;
  }

  .privacy-section strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .privacy-section code {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-green);
    background: rgba(5, 7, 26, 0.6);
    padding: 2px 6px;
    border-radius: 2px;
  }

  .legal-basis,
  .retention {
    font-size: 15px !important;
    color: var(--color-text-muted) !important;
  }

  /* ── Table ───────────────────────────────────────────────── */
  .table-wrap {
    overflow-x: auto;
    margin-bottom: 16px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-heading);
    font-size: 15px;
  }

  th {
    text-align: left;
    padding: 10px 14px;
    font-weight: 600;
    color: var(--color-text);
    border-bottom: 1px solid var(--color-border);
    letter-spacing: 0.5px;
  }

  td {
    padding: 10px 14px;
    color: var(--color-text-dim);
    border-bottom: 1px solid rgba(74, 90, 173, 0.2);
  }

  td code {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-green);
  }

  /* ── Links ───────────────────────────────────────────────── */
  .text-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .text-link:hover {
    border-color: var(--color-gold);
  }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    padding: 28px 32px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .footer-text {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .footer-links {
    display: flex;
    gap: 20px;
  }

  .footer-link {
    font-family: var(--font-heading);
    font-size: 13px;
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

  /* ── Responsive ──────────────────────────────────────────── */
  @media (max-width: 600px) {
    .privacy {
      padding: 100px 20px 60px;
    }

    .footer {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
  }
</style>
