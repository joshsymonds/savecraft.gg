<!--
  @component
  Terms of Service page — rendered at savecraft.gg/terms
-->
<svelte:head>
  <title>Terms of Service - Savecraft</title>
  <meta
    name="description"
    content="Savecraft terms of service. What you agree to when using the service."
  />
</svelte:head>

<div class="page">
  <article class="privacy">
    <h1 class="privacy-title">Terms of Service</h1>
    <p class="privacy-updated">Last updated: March 22, 2026</p>

    <div class="privacy-tldr">
      <strong>TL;DR:</strong> Savecraft parses your game saves and serves that data to AI assistants
      you connect. You own your data. We don't control what AI assistants do with it. Don't abuse
      the service. We can change or discontinue things with notice. Our code is
      <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link">open source</a> — you
      can verify what we do.
    </div>

    <section class="privacy-section">
      <h2>1. What Savecraft is</h2>
      <p>
        Savecraft is a service operated by Josh Symonds ("we," "us," "our") that parses video game
        save files and serves structured game state data to AI assistants via the Model Context
        Protocol (MCP). It consists of:
      </p>
      <ul>
        <li>A <strong>local daemon</strong> that runs on your gaming device and parses save files</li>
        <li>A <strong>cloud service</strong> that stores and serves your parsed game data</li>
        <li>A <strong>web interface</strong> at savecraft.gg for managing devices and settings</li>
        <li>
          <strong>API adapters</strong> that connect to game platform APIs (e.g., Battle.net) on
          your behalf
        </li>
      </ul>
      <p>
        By using Savecraft, you agree to these terms. If you don't agree, don't use the service.
      </p>
    </section>

    <section class="privacy-section">
      <h2>2. Your account</h2>
      <p>
        You need an account to use Savecraft. You authenticate via Clerk using your email address.
        You are responsible for maintaining the security of your account credentials and any devices
        you link.
      </p>
      <p>
        You must be at least 13 years old to use Savecraft, or at least 16 if you are in the
        European Economic Area. If you are under the age of majority in your jurisdiction, you
        represent that your parent or legal guardian has reviewed and agreed to these terms on your
        behalf. We do not knowingly collect personal information from children under 13. If we
        learn we have collected data from a child under 13, we will delete it promptly.
      </p>
    </section>

    <section class="privacy-section">
      <h2>3. Your data</h2>
      <p>
        <strong>You own your data.</strong> Your game save data, notes, and any content you create
        through Savecraft remain yours. We claim no ownership or intellectual property rights over
        your data.
      </p>
      <p>
        You grant us a limited license to store, process, and serve your data solely to provide the
        Savecraft service — parsing saves, storing structured game state, serving it to AI assistants
        you authorize, and displaying it in the web interface. This license ends when you delete your
        data or account.
      </p>
      <p>
        <strong>Data portability.</strong> You may export all data Savecraft stores about you
        (account information, parsed saves, notes) by contacting us at
        <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a>. We will
        provide your data in a structured, machine-readable JSON format within 30 days.
      </p>
      <p>
        <strong>Data deletion.</strong> You may request deletion of your account and all associated
        data at any time by contacting us. We will delete your data within 60 days, including
        backups. Deletion does not affect data stored by game publishers or AI assistant providers.
      </p>
      <p>
        If you are a resident of the European Economic Area, the United Kingdom, or California,
        you have additional rights regarding your personal data, including rights of access,
        rectification, erasure, portability, and objection. See our
        <a href="/privacy" class="text-link">Privacy Policy</a> for details on how to exercise
        these rights.
      </p>
    </section>

    <section class="privacy-section">
      <h2>4. Game platform accounts</h2>
      <p>
        Some games (such as World of Warcraft) require you to connect a game platform account
        (e.g., Battle.net) via OAuth. When you do this:
      </p>
      <ul>
        <li>We access only the data necessary to fetch your character profiles</li>
        <li>We store OAuth tokens solely for character data retrieval and refresh</li>
        <li>You can disconnect at any time from Savecraft or from the game platform's settings</li>
        <li>
          Your use of game platform APIs is also subject to that platform's terms of service
        </li>
      </ul>
      <p>
        <strong>Third-party data accuracy.</strong> Data retrieved from game platform APIs is
        provided to you "as is." We do not guarantee the accuracy, completeness, or timeliness of
        data from third-party sources. Game publishers may change, restrict, or discontinue their
        APIs at any time without notice to us, which may affect Savecraft's functionality. We are
        not responsible for any actions you take based on third-party data surfaced through
        Savecraft.
      </p>
    </section>

    <section class="privacy-section">
      <h2>5. AI assistant integration</h2>
      <p>
        Savecraft serves your game data to AI assistants (Claude, ChatGPT, Gemini, etc.) that you
        connect via MCP. <strong>We provide structured data only. We do not generate, control,
        monitor, or store any AI-produced output.</strong>
      </p>
      <p>
        AI assistants may produce inaccurate, misleading, or incomplete responses based on data
        Savecraft provides. The AI assistant provider — not Savecraft — is responsible for how that
        data is interpreted, presented, or acted upon. You should not rely on AI-generated output
        as a substitute for your own judgment.
      </p>
      <p>
        AI assistants can create, update, and delete notes on your behalf during conversation. These
        actions are performed under your authorization through the MCP connection you established.
        You are responsible for reviewing changes made by AI assistants to your notes.
      </p>
    </section>

    <section class="privacy-section">
      <h2>6. The daemon</h2>
      <p>
        The Savecraft daemon is optional software that runs on your device with your permission. It:
      </p>
      <ul>
        <li>
          Reads game save files in <strong>read-only</strong> mode — it cannot modify your saves
        </li>
        <li>Parses save files locally using sandboxed WASM plugins</li>
        <li>Transmits only parsed JSON data, never raw save files</li>
        <li>Can be stopped or uninstalled at any time</li>
      </ul>
      <p>
        The daemon is open source. You can inspect exactly what it does before running it.
      </p>
      <p>
        <strong>Local software risks.</strong> By installing the daemon, you acknowledge that any
        software running on your device carries inherent risks, including potential conflicts with
        other software, impact on system performance, and interaction with antivirus or security
        tools. We are not liable for any system performance issues, software conflicts, or data
        loss arising from the daemon's operation, except to the extent caused by our gross
        negligence. You are responsible for maintaining backups of your game saves.
      </p>
    </section>

    <section class="privacy-section">
      <h2>7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use Savecraft to violate any game's terms of service</li>
        <li>Attempt to access other users' data</li>
        <li>Reverse engineer, attack, or abuse the service infrastructure</li>
        <li>Use automated tools to scrape or overload the service</li>
        <li>Upload content that is illegal, harmful, or violates others' rights</li>
        <li>
          Upload content that infringes any third party's intellectual property rights, including
          copyrighted game guides or strategy content without permission
        </li>
        <li>Resell access to Savecraft without our permission</li>
        <li>
          Use the service to develop a competing product or for competitive analysis
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these terms.
      </p>
    </section>

    <section class="privacy-section">
      <h2>8. Copyright and DMCA</h2>
      <p>
        We respect intellectual property rights and expect our users to do the same. If you believe
        content hosted on Savecraft infringes your copyright, you may submit a notice under the
        Digital Millennium Copyright Act (DMCA) to our designated agent:
      </p>
      <p>
        <strong>DMCA Agent:</strong> Josh Symonds<br />
        <strong>Email:</strong>
        <a href="mailto:dmca@savecraft.gg" class="text-link">dmca@savecraft.gg</a>
      </p>
      <p>
        Your notice must include: identification of the copyrighted work, identification of the
        infringing material and its location on Savecraft, your contact information, a statement
        of good faith belief that the use is not authorized, and a statement under penalty of
        perjury that the information is accurate and you are authorized to act on behalf of the
        copyright owner.
      </p>
      <p>
        We will respond to valid DMCA notices promptly and may remove or disable access to the
        allegedly infringing content. Users who repeatedly infringe others' copyrights may have
        their accounts terminated.
      </p>
    </section>

    <section class="privacy-section">
      <h2>9. Service availability</h2>
      <p>
        We strive to keep Savecraft available and reliable, but we do not guarantee uninterrupted
        service. Things break, infrastructure has outages, and we're a small team. We may also
        need to take the service down for maintenance.
      </p>
      <p>
        We reserve the right to modify, suspend, or discontinue any part of the service with
        reasonable notice. For material changes that affect your data, we will provide at least
        30 days' notice via email and a window to export your data before any deletion occurs.
      </p>
    </section>

    <section class="privacy-section">
      <h2>10. Intellectual property and open source</h2>
      <p>
        Savecraft's source code is available under the
        <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link">Apache License,
        Version 2.0</a>. <strong>These Terms govern your use of the hosted service at savecraft.gg,
        not the source code itself.</strong> If you self-host the Savecraft software, only the
        Apache License applies — these Terms do not.
      </p>
      <p>
        Nothing in these Terms limits your rights under, or grants you rights that supersede,
        the terms of any applicable open-source license.
      </p>
      <p>
        The Savecraft name, logo, and branding are our trademarks. Game names, characters, and
        game data referenced through Savecraft are the property of their respective publishers.
        Savecraft is not affiliated with or endorsed by any game publisher.
      </p>
    </section>

    <section class="privacy-section">
      <h2>11. Indemnification</h2>
      <p>
        You agree to defend, indemnify, and hold harmless Savecraft and its operator from any
        third-party claims, damages, losses, and expenses (including reasonable attorneys' fees)
        arising from: your violation of these Terms, your misuse of the service, content you
        upload or create through the service, your violation of any game platform's terms of
        service, or your violation of any applicable law.
      </p>
    </section>

    <section class="privacy-section">
      <h2>12. Disclaimer of warranties</h2>
      <p class="legal-caps">
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SAVECRAFT IS PROVIDED "AS IS" AND
        "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
        INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
      </p>
      <p class="legal-caps">
        WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE; THAT
        DEFECTS WILL BE CORRECTED; THAT PARSED GAME DATA WILL BE ACCURATE OR COMPLETE; THAT DATA
        FROM THIRD-PARTY GAME APIS WILL BE AVAILABLE OR CURRENT; OR THAT THE DAEMON SOFTWARE
        WILL BE COMPATIBLE WITH YOUR SYSTEM CONFIGURATION.
      </p>
      <p>
        Some jurisdictions do not allow the exclusion of certain warranties. In those
        jurisdictions, the above exclusions apply only to the extent permitted by law.
      </p>
    </section>

    <section class="privacy-section">
      <h2>13. Limitation of liability</h2>
      <p class="legal-caps">
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SAVECRAFT OR ITS
        OPERATOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
        DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING
        OUT OF OR IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, REGARDLESS OF THE
        THEORY OF LIABILITY (CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE) AND EVEN IF WE
        HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p class="legal-caps">
        OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE
        TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE
        TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) FIFTY U.S. DOLLARS ($50).
      </p>
      <p>
        Nothing in these terms excludes liability that cannot be excluded under applicable law,
        including liability for fraud, gross negligence, or willful misconduct.
      </p>
    </section>

    <section class="privacy-section">
      <h2>14. Dispute resolution</h2>
      <p>
        <strong>Informal resolution first.</strong> Before filing any formal proceeding, you agree
        to contact us at
        <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a> and attempt
        to resolve the dispute informally for at least 30 days.
      </p>
      <p>
        <strong>Binding arbitration.</strong> If we cannot resolve the dispute informally, you and
        we agree to resolve any claims relating to these Terms or the service through final and
        binding individual arbitration, except as set forth below. The arbitration will be
        administered by JAMS under its Streamlined Arbitration Rules or, if JAMS is unavailable,
        by a mutually agreed provider. The arbitration will be conducted by telephone, online, or
        based on written submissions — the arbitrator will determine whether a hearing is necessary.
        The arbitrator's decision will be binding and may be entered as a judgment in any court of
        competent jurisdiction.
      </p>
      <p>
        <strong>Class action waiver.</strong> You and we agree that disputes will be resolved
        only on an individual basis and not in a class, consolidated, or representative action.
        If for any reason a claim proceeds in court rather than in arbitration, you and we each
        waive any right to a jury trial.
      </p>
      <p>
        <strong>Opt-out.</strong> You may opt out of this arbitration agreement by sending written
        notice to <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a>
        within 30 days of first agreeing to these Terms. If you opt out, disputes will be resolved
        in the state or federal courts located in Santa Barbara County, California.
      </p>
      <p>
        <strong>Exceptions.</strong> Either party may bring claims in small claims court if
        eligible. Either party may seek injunctive or other equitable relief in any court of
        competent jurisdiction to prevent the actual or threatened infringement of intellectual
        property rights.
      </p>
    </section>

    <section class="privacy-section">
      <h2>15. Termination</h2>
      <p>
        You may stop using Savecraft at any time. You may request account deletion by emailing
        <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a>.
      </p>
      <p>
        We may suspend or terminate your account if you violate these Terms, if required by law,
        or if we discontinue the service. If we terminate your account without cause, we will
        provide at least 30 days' notice and a reasonable window to export your data.
      </p>
      <p>
        Upon termination, your right to use the service ceases immediately. Sections that by their
        nature should survive termination will survive, including: Your Data (Section 3, regarding
        ownership), Indemnification (Section 11), Disclaimer of Warranties (Section 12), Limitation
        of Liability (Section 13), and Dispute Resolution (Section 14).
      </p>
    </section>

    <section class="privacy-section">
      <h2>16. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of California, United States, without
        regard to conflict of law principles.
      </p>
    </section>

    <section class="privacy-section">
      <h2>17. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. For material changes, we will notify you via
        email at least 30 days before they take effect. Continued use of Savecraft after changes
        take effect constitutes acceptance of the updated terms.
      </p>
      <p>
        Previous versions are available in our
        <a href="https://github.com/joshsymonds/savecraft.gg" class="text-link"
          >public Git repository</a
        >.
      </p>
    </section>

    <section class="privacy-section">
      <h2>18. Contact</h2>
      <p>
        Questions about these terms? Reach us at
        <a href="mailto:josh@savecraft.gg" class="text-link">josh@savecraft.gg</a>.
      </p>
    </section>
  </article>
</div>

<style>
  .page {
    min-height: 100vh;
  }

  /* Reuse privacy page styles — same layout and typography */
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
    content: '';
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

  .legal-caps {
    font-size: 14px !important;
    letter-spacing: 0.2px;
    line-height: 1.8 !important;
  }

  .text-link {
    color: var(--color-gold);
    text-decoration: none;
    border-bottom: 1px solid rgba(200, 168, 78, 0.3);
    transition: border-color 0.2s;
  }

  .text-link:hover {
    border-color: var(--color-gold);
  }

  @media (max-width: 600px) {
    .privacy {
      padding: 100px 20px 60px;
    }
  }
</style>
