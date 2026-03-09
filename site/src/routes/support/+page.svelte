<!--
  @component
  Support & contact page at savecraft.gg/support
-->
<script lang="ts">
  import { PUBLIC_APP_URL } from "$env/static/public";
</script>

<svelte:head>
  <title>Support - Savecraft</title>
  <meta name="description" content="Get help with Savecraft. Join our Discord or email support." />
</svelte:head>

<div class="page">
  <!-- NAV -->
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

  <!-- CONTENT -->
  <article class="support">
    <h1 class="support-title">Support</h1>
    <p class="support-subtitle">
      Need help setting up Savecraft, connecting a game, or something not working right? Here's how
      to reach us.
    </p>

    <div class="channels">
      <a href="https://discord.gg/YnC8stpEmF" class="channel" target="_blank" rel="noopener">
        <div class="channel-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"
            />
          </svg>
        </div>
        <div class="channel-content">
          <h2 class="channel-name">Discord</h2>
          <p class="channel-desc">
            Fastest way to get help. Ask questions, report bugs, or chat with other players.
          </p>
        </div>
        <span class="channel-arrow">&rarr;</span>
      </a>

      <a href="mailto:support@savecraft.gg" class="channel">
        <div class="channel-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 4L12 13L2 4" />
          </svg>
        </div>
        <div class="channel-content">
          <h2 class="channel-name">Email</h2>
          <p class="channel-desc">
            support@savecraft.gg &mdash; for anything that doesn't fit in Discord.
          </p>
        </div>
        <span class="channel-arrow">&rarr;</span>
      </a>
    </div>

    <section class="faq">
      <h2 class="faq-title">Common questions</h2>

      <div class="faq-item">
        <h3>My saves aren't showing up</h3>
        <p>
          Make sure the Savecraft daemon is running and paired to your account. Check the
          <a href={`${PUBLIC_APP_URL}/sources`} class="text-link">sources page</a> to see if your device
          is online. If it shows offline, restart the daemon and check the logs.
        </p>
      </div>

      <div class="faq-item">
        <h3>How do I connect an AI assistant?</h3>
        <p>
          In Claude, ChatGPT, or any MCP-compatible assistant, add Savecraft as an MCP server using
          <code>https://mcp.savecraft.gg/mcp</code>. You'll be redirected to sign in. After that,
          the assistant can access your game data.
        </p>
      </div>

      <div class="faq-item">
        <h3>Is my data safe?</h3>
        <p>
          Yes. Read our <a href="/privacy" class="text-link">privacy policy</a> for the full
          details. Short version: we collect the minimum data needed, don't run analytics, don't see
          your AI conversations, and our code is
          <a
            href="https://github.com/joshsymonds/savecraft.gg"
            class="text-link"
            target="_blank"
            rel="noopener">open source</a
          >.
        </p>
      </div>
    </section>
  </article>

  <!-- FOOTER -->
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
      <a href="/games" class="footer-link">GAMES</a>
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

  /* -- Nav (same as privacy/homepage) -- */
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

  /* -- Support content -- */
  .support {
    max-width: 800px;
    margin: 0 auto;
    padding: 120px 32px 80px;
  }

  .support-title {
    font-family: var(--font-pixel);
    font-size: clamp(14px, 2vw, 20px);
    color: var(--color-text);
    line-height: 1.7;
    margin-bottom: 8px;
  }

  .support-subtitle {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
    margin-bottom: 40px;
  }

  /* -- Channel cards -- */
  .channels {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 56px;
  }

  .channel {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    background: linear-gradient(135deg, #0a0e2e 0%, #111b47 50%, #0a0e2e 100%);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    text-decoration: none;
    transition: all 0.2s;
  }

  .channel:hover {
    border-color: var(--color-gold);
    box-shadow: 0 0 16px rgba(200, 168, 78, 0.12);
  }

  .channel-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gold);
  }

  .channel-content {
    flex: 1;
  }

  .channel-name {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }

  .channel-desc {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.5;
  }

  .channel-arrow {
    flex-shrink: 0;
    font-size: 20px;
    color: var(--color-text-muted);
    transition: color 0.2s;
  }

  .channel:hover .channel-arrow {
    color: var(--color-gold);
  }

  /* -- FAQ -- */
  .faq {
    margin-bottom: 40px;
  }

  .faq-title {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 600;
    color: var(--color-gold);
    margin-bottom: 24px;
    letter-spacing: 0.5px;
  }

  .faq-item {
    margin-bottom: 24px;
  }

  .faq-item h3 {
    font-family: var(--font-heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 8px;
    letter-spacing: 0.5px;
  }

  .faq-item p {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-text-dim);
    line-height: 1.7;
  }

  .faq-item code {
    font-family: var(--font-body);
    font-size: 18px;
    color: var(--color-green);
    background: rgba(5, 7, 26, 0.6);
    padding: 2px 6px;
    border-radius: 2px;
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

  /* -- Footer -- */
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

  /* -- Responsive -- */
  @media (max-width: 600px) {
    .support {
      padding: 100px 20px 60px;
    }

    .channel {
      padding: 20px 16px;
      gap: 14px;
    }

    .channel-icon {
      width: 40px;
      height: 40px;
    }

    .footer {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
  }
</style>
