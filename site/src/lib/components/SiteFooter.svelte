<!--
  @component
  Shared site footer. Used in the root layout across all pages.
-->
<script lang="ts">
  interface Props {
    wide?: boolean;
  }

  let { wide = false }: Props = $props();
</script>

<footer class="footer" class:wide>
  <span class="footer-text"
    >savecraft.gg &mdash; by <a
      href="https://joshsymonds.com"
      class="footer-link"
      target="_blank"
      rel="noopener">@joshsymonds</a
    ></span
  >
  <div class="footer-links">
    <a href="/games" class="footer-link">GAMES</a>
    <a href="/docs" class="footer-link">DOCS</a>
    <a href="/support" class="footer-link">SUPPORT</a>
    <a href="/privacy" class="footer-link">PRIVACY</a>
    <a href="/terms" class="footer-link">TERMS</a>
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

<style>
  .footer {
    padding: 28px 32px;
    border-top: 1px solid rgba(74, 90, 173, 0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .footer.wide {
    max-width: 1100px;
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

  @media (max-width: 600px) {
    .footer {
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }

    .footer-links {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
