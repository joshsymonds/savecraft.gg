<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Panel from "./layout/Panel.svelte";
  import Section from "./layout/Section.svelte";
  import Stat from "./data/Stat.svelte";
  import Badge from "./data/Badge.svelte";

  const { Story } = defineMeta({ title: "Flair/Direction Mock" });

  const wrap = "width: 560px;";
</script>

<script>
  // THROWAWAY direction mock for the views flair pass (epic task #1).
  // Layer 1 (texture) and Layer 2a (count-up, stagger) now live in the
  // shared components — Stat tweens its own numeric values. Only the
  // Verdict treatment (Layer 3) remains mocked here.
  const staggerRows = [
    { name: "Skin of the Vipermagi", source: "Mephisto (Hell)", odds: "1:312" },
    { name: "Skin of the Vipermagi", source: "Andariel (Hell)", odds: "1:489" },
    { name: "Skin of the Vipermagi", source: "Ancient Tunnels", odds: "1:1,204" },
    { name: "Skin of the Vipermagi", source: "Pit Level 2", odds: "1:1,377" },
    { name: "Skin of the Vipermagi", source: "Council Members", odds: "1:2,051" },
  ];
</script>

<!-- ── Direction 1: arcade texture & depth on the real components ── -->
<Story name="Bottleneck Card">
  <div class="flair-mock" style={wrap}>
    <Panel>
      <Section title="Factory Diagnosis" accent="var(--color-negative)">
        <div class="stat-row">
          <Stat value={3} label="Bottlenecks" variant="negative" />
          <Stat value={28} label="Active Items" variant="muted" />
          <Stat value={5} label="Critical" variant="negative" />
        </div>
      </Section>

      <div class="card-stack">
        <Panel nested accent="var(--color-negative)">
          <div class="card-head">
            <span class="card-name">Steel Plate</span>
            <Badge label="Not Built" variant="negative" />
            <Badge label="4 Downstream" variant="info" />
            <span class="card-rate negative">-1,137/min</span>
          </div>
          <div class="card-line">
            <span class="card-label">Starves:</span> Engine Unit, Low Density Structure, Flying Robot Frame
          </div>
          <div class="card-line">
            <span class="card-label">Fix from:</span> Iron Plate
            <Badge label="+1,960/min" variant="positive" />
          </div>
        </Panel>

        <Panel nested accent="var(--color-warning)">
          <div class="card-head">
            <span class="card-name">Copper Cable</span>
            <Badge label="Need More Machines" variant="warning" />
            <Badge label="7 Downstream" variant="info" />
            <span class="card-rate warning">-2/min</span>
          </div>
          <div class="card-line">
            <span class="card-label">Need:</span> +1 Assembling Machine 3 <span class="muted">(have 37)</span>
          </div>
        </Panel>

        <Panel nested accent="var(--color-negative)">
          <div class="card-head">
            <span class="card-name">Crude Oil</span>
            <Badge label="Not Built" variant="negative" />
            <span class="card-rate negative">-8,411.7/min</span>
          </div>
          <div class="card-line">
            <span class="card-label">Used by:</span> Advanced Oil Processing <span class="muted">(100%)</span>
          </div>
        </Panel>
      </div>
    </Panel>
  </div>
</Story>

<!-- ── Direction 2: hero verdict — the AI's answer, celebrated ── -->
<Story name="Verdict">
  <div class="flair-mock" style={wrap}>
    <Panel accent="var(--color-gold)">
      <div class="verdict">
        <div class="verdict-stamp">S</div>
        <div class="verdict-main">
          <span class="verdict-value">~134 runs</span>
          <span class="verdict-caption">Expected Time to Drop</span>
          <span class="verdict-sub">Mephisto (Hell) — best source for your 412% MF</span>
        </div>
      </div>
    </Panel>

    <div class="verdict-spacer"></div>

    <Panel accent="var(--color-rarity-epic)">
      <div class="verdict">
        <div class="verdict-stamp grade-b">B+</div>
        <div class="verdict-main">
          <span class="verdict-value" style="color: var(--color-rarity-epic);">Solid Pick</span>
          <span class="verdict-caption">P2P7 — Sphinx of Forgotten Lore</span>
          <span class="verdict-sub">Best in Dimir, replaceable in your Azorius lane</span>
        </div>
      </div>
    </Panel>

    <div class="verdict-spacer"></div>

    <Panel accent="var(--color-negative)">
      <div class="verdict">
        <div class="verdict-stamp grade-f">!</div>
        <div class="verdict-main">
          <span class="verdict-value" style="color: var(--color-negative);">Factory Stalled</span>
          <span class="verdict-caption">3 Critical Bottlenecks</span>
          <span class="verdict-sub">Steel plate starvation cascades to 4 product lines</span>
        </div>
      </div>
    </Panel>
  </div>
</Story>

<!-- ── Direction 3: motion — count-up, stagger, hover lift ── -->
<Story name="Motion">
  <div class="flair-mock" style={wrap}>
    <Panel>
      <Section title="Farming Plan" accent="var(--color-gold)">
        <div class="stat-row">
          <Stat value="~134" label="Expected Runs" variant="highlight" />
          <Stat value="41.3%" label="MF Efficiency" variant="positive" />
          <Stat value={45} label="Sources Ranked" variant="info" />
        </div>
      </Section>

      <div class="mock-table">
        {#each staggerRows as row, i}
          <div class="mock-row" style="animation-delay: {i * 75}ms">
            <span class="row-name">{row.name}</span>
            <span class="row-source">{row.source}</span>
            <span class="row-odds">{row.odds}</span>
          </div>
        {/each}
      </div>
      <p class="hover-hint">Hover a row to preview the interactive lift treatment.</p>
    </Panel>
  </div>
</Story>

<style>
  /* ════ Layer 1 treatments now live in view.css + Panel/Section/Badge.
     Only the Layer 2/3 candidates (Verdict, motion) remain mocked here. ════ */

  /* ════ Mock layout (stand-ins for view markup) ════ */

  .stat-row {
    display: flex;
    justify-content: space-around;
    padding: var(--space-sm) 0;
  }

  .card-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .card-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
  }

  .card-rate {
    margin-left: auto;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 15px;
  }

  .card-rate.negative { color: var(--color-negative); }
  .card-rate.warning { color: var(--color-warning); }

  .card-line {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    margin-top: var(--space-xs);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .card-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--color-text-muted);
  }

  .muted { color: var(--color-text-muted); }

  /* ════ Verdict mock (Layer 3 candidate) ════ */

  .verdict {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    animation: verdict-land 550ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }

  .verdict-spacer { height: var(--space-lg); }

  .verdict-stamp {
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-pixel);
    font-size: 28px;
    color: var(--color-gold-light);
    border: 3px solid var(--color-gold);
    outline: 1px solid color-mix(in srgb, var(--color-gold) 40%, transparent);
    outline-offset: 3px;
    border-radius: var(--radius-md);
    transform: rotate(-6deg);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--color-gold) 40%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--color-gold) 25%, transparent);
    animation: stamp-land 450ms cubic-bezier(0.2, 0.9, 0.3, 1.4) 200ms both;
  }

  .verdict-stamp.grade-b {
    color: var(--color-rarity-epic);
    border-color: var(--color-rarity-epic);
    outline-color: color-mix(in srgb, var(--color-rarity-epic) 40%, transparent);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--color-rarity-epic) 40%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--color-rarity-epic) 25%, transparent);
    font-size: 20px;
  }

  .verdict-stamp.grade-f {
    color: var(--color-negative);
    border-color: var(--color-negative);
    outline-color: color-mix(in srgb, var(--color-negative) 40%, transparent);
    box-shadow:
      0 0 16px color-mix(in srgb, var(--color-negative) 40%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--color-negative) 25%, transparent);
  }

  .verdict-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    min-width: 0;
  }

  .verdict-value {
    font-family: var(--font-heading);
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    color: var(--color-gold-light);
    text-shadow: 0 0 24px color-mix(in srgb, var(--color-gold) 35%, transparent);
  }

  .verdict-caption {
    font-family: var(--font-pixel);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--color-text-muted);
  }

  .verdict-sub {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
  }

  @keyframes verdict-land {
    0% { opacity: 0; transform: scale(0.94); filter: brightness(1.5); }
    60% { transform: scale(1.02); }
    100% { opacity: 1; transform: scale(1); filter: brightness(1); }
  }

  @keyframes stamp-land {
    0% { opacity: 0; transform: rotate(-6deg) scale(1.6); }
    100% { opacity: 1; transform: rotate(-6deg) scale(1); }
  }

  /* ════ Motion mock (Layer 2 candidates) ════ */

  .mock-table {
    display: flex;
    flex-direction: column;
    margin-top: var(--space-md);
  }

  .mock-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
    animation: row-in 420ms ease-out both;
    transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    cursor: pointer;
  }

  .mock-row:hover {
    background: color-mix(in srgb, var(--color-border) 12%, transparent);
    border-bottom-color: var(--color-border-light);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-border-light) 20%, transparent);
  }

  .row-name {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-rarity-uncommon);
  }

  .row-source {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    flex: 1;
  }

  .row-odds {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-gold);
    font-variant-numeric: tabular-nums;
  }

  @keyframes row-in {
    from { opacity: 0; transform: translateX(-6px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .hover-hint {
    margin-top: var(--space-sm);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  /* ════ Reduced-motion guard — the Layer 1 pattern ════ */

  @media (prefers-reduced-motion: reduce) {
    .flair-mock *,
    .flair-mock :global(*) {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
