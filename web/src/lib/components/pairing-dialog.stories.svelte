<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  const { Story } = defineMeta({
    title: "Standalone/PairingDialog",
    tags: ["autodocs"],
  });

  /**
   * Self-contained HTML for the Windows pairing dialog.
   * This is the exact markup that will be embedded in the Go tray binary.
   * Google Fonts are loaded here for Storybook preview; the Go version
   * will use embedded woff2 instead.
   */
  function dialogHTML(state: "initial" | "waiting" = "initial"): string {
    const code = "A3F-82K";
    const isWaiting = state === "waiting";

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Rajdhani:wght@400;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 420px;
    height: 480px;
    overflow: hidden;
    background: #05071a;
    color: #e8e0d0;
    font-family: 'Rajdhani', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }

  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    padding: 40px;
    animation: fade-in 0.4s ease-out;
  }

  /* ── Logo ──────────────────────────────── */

  .logo {
    font-family: 'Press Start 2P', monospace;
    font-size: 18px;
    color: #c8a84e;
    letter-spacing: 6px;
    text-align: center;
  }

  .subtitle {
    font-family: 'Rajdhani', sans-serif;
    font-size: 18px;
    font-weight: 400;
    color: #a0a8cc;
    text-align: center;
    margin-top: 8px;
  }

  /* ── Code display ─────────────────────── */

  .code-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .code-label {
    font-size: 16px;
    font-weight: 600;
    color: #a0a8cc;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .code-value {
    font-family: 'Press Start 2P', monospace;
    font-size: 28px;
    color: #e8c86e;
    letter-spacing: 8px;
    padding: 16px 28px;
    background: rgba(200, 168, 78, 0.08);
    border: 1px solid rgba(200, 168, 78, 0.25);
    border-radius: 6px;
    text-align: center;
  }

  /* ── Button ───────────────────────────── */

  .link-btn {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    color: #05071a;
    letter-spacing: 1px;
    background: linear-gradient(135deg, #c8a84e, #e8c86e);
    border: none;
    border-radius: 4px;
    padding: 14px 32px;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
  }

  .link-btn:hover {
    background: linear-gradient(135deg, #e8c86e, #f0d888);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(200, 168, 78, 0.3);
  }

  .link-btn:active {
    transform: translateY(0);
  }

  /* ── Waiting state ────────────────────── */

  .waiting-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .waiting-text {
    font-size: 18px;
    font-weight: 600;
    color: #a0a8cc;
    animation: pulse-text 2s ease-in-out infinite;
  }

  .spinner {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .spinner-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c8a84e;
    opacity: 0.4;
    animation: dot-pulse 1.2s ease-in-out infinite;
  }

  .spinner-dot:nth-child(2) { animation-delay: 0.2s; }
  .spinner-dot:nth-child(3) { animation-delay: 0.4s; }

  /* ── Close link ───────────────────────── */

  .close-link {
    font-size: 14px;
    color: #a0a8cc;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s;
    border: none;
    background: none;
    font-family: 'Rajdhani', sans-serif;
  }

  .close-link:hover {
    color: #e8e0d0;
  }

  /* ── Decorative border ────────────────── */

  .border-glow {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #c8a84e, transparent);
  }

  /* ── Animations ───────────────────────── */

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse-text {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }

  @keyframes dot-pulse {
    0%, 80%, 100% { opacity: 0.4; transform: scale(1); }
    40%           { opacity: 1; transform: scale(1.3); }
  }
</style>
</head>
<body>
  <div class="border-glow"></div>
  <div class="container">
    <div>
      <div class="logo">SAVECRAFT</div>
      <div class="subtitle">Installed successfully</div>
    </div>

    <div class="code-section">
      <span class="code-label">Your link code</span>
      <div class="code-value">${code}</div>
    </div>

    ${isWaiting
      ? `<div class="waiting-section">
          <div class="spinner">
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
          </div>
          <span class="waiting-text">Waiting for pairing...</span>
        </div>`
      : `<button class="link-btn">Link Account</button>`
    }

    <button class="close-link">${isWaiting ? "Close" : "Skip for now"}</button>
  </div>
</body>
</html>`;
  }
</script>

<!-- Initial state: code + Link Account button -->
<Story name="Initial">
  <div style="width: 420px; height: 480px; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
    <iframe
      srcdoc={dialogHTML("initial")}
      style="width: 100%; height: 100%; border: none;"
      title="Pairing Dialog — Initial"
    ></iframe>
  </div>
</Story>

<!-- Waiting state: spinner + waiting message -->
<Story name="Waiting">
  <div style="width: 420px; height: 480px; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
    <iframe
      srcdoc={dialogHTML("waiting")}
      style="width: 100%; height: 100%; border: none;"
      title="Pairing Dialog — Waiting"
    ></iframe>
  </div>
</Story>
