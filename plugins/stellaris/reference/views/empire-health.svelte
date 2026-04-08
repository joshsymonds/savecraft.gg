<!--
  @component
  Stellaris empire health diagnostic view — problems-first design.
  Scans five dimensions (economy, stability, military, politics, external threats)
  and surfaces issues by severity. Healthy dimensions show "all clear" rather than
  empty space, so the player always sees the full picture at a glance.
-->
<script lang="ts">
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import RankedList from "../../../../views/src/components/data/RankedList.svelte";
  import BarChart from "../../../../views/src/components/charts/BarChart.svelte";
  import ProgressBar from "../../../../views/src/components/charts/ProgressBar.svelte";
  import ProgressRing from "../../../../views/src/components/charts/ProgressRing.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import CardGrid from "../../../../views/src/components/layout/CardGrid.svelte";

  type Severity = "critical" | "severe" | "moderate" | "healthy";

  interface EconomyProblem {
    resource: string;
    severity: Severity;
    net_per_month: number;
    stockpile: number;
    runway_months: number | null;
    top_expenses: { category: string; amount: number }[];
  }

  interface PlanetProblem {
    name: string;
    severity: Severity;
    stability: number;
    free_housing: number;
    crime: number;
    amenities_surplus: number;
    issues: string[];
  }

  interface War {
    name: string;
    player_side: "attacker" | "defender";
    war_exhaustion: number;
    severity: Severity;
  }

  interface Faction {
    name: string;
    faction_type: string;
    happiness: number;
    support: number;
    severity: Severity;
  }

  interface HostileEmpire {
    name: string;
    severity: Severity;
    reason: string;
    military_power: number;
    player_military_power: number;
    power_ratio: number;
  }

  interface Props {
    data: {
      summary: { critical: number; severe: number; moderate: number; healthy_dimensions: number };
      economy: { problems: EconomyProblem[] };
      stability: { problem_count: number; worst_stability: number; planets: PlanetProblem[] };
      military: { naval_used: number; fleet_size: number; wars: War[] };
      politics: { factions: Faction[] };
      threats: { crisis_active: boolean; crisis_type: string | null; hostile_empires: HostileEmpire[] };
    };
  }

  let { data }: Props = $props();

  // ── Helpers ──

  function severityVariant(s: Severity): "negative" | "warning" | "info" | "positive" {
    switch (s) {
      case "critical": return "negative";
      case "severe": return "warning";
      case "moderate": return "info";
      default: return "positive";
    }
  }

  function sectionAccent(problems: { severity: Severity }[]): string {
    if (problems.some((p) => p.severity === "critical")) return "var(--color-negative)";
    if (problems.some((p) => p.severity === "severe")) return "var(--color-warning)";
    if (problems.some((p) => p.severity === "moderate")) return "var(--color-info)";
    return "var(--color-positive)";
  }

  function formatResource(name: string): string {
    return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function formatCategory(name: string): string {
    return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function issueLabel(issue: string): string {
    switch (issue) {
      case "low_stability": return "Low Stability";
      case "housing_shortage": return "Housing";
      case "high_crime": return "Crime";
      case "amenity_deficit": return "Amenities";
      default: return issue;
    }
  }

  function issueVariant(issue: string): "negative" | "warning" | "info" | "muted" {
    switch (issue) {
      case "low_stability": return "negative";
      case "housing_shortage": return "warning";
      case "high_crime": return "negative";
      case "amenity_deficit": return "info";
      default: return "muted";
    }
  }

  function threatReason(reason: string): string {
    switch (reason) {
      case "casus_belli": return "Has CB";
      case "hostile": return "Hostile";
      case "closed_borders_low_opinion": return "Closed Borders";
      case "crisis": return "Crisis";
      case "awakened_fe": return "Awakened";
      default: return reason;
    }
  }

  function threatReasonVariant(reason: string): "negative" | "warning" | "info" | "muted" {
    switch (reason) {
      case "casus_belli": return "negative";
      case "hostile": return "negative";
      case "crisis": return "negative";
      case "awakened_fe": return "warning";
      default: return "warning";
    }
  }

  function powerLabel(ratio: number): string {
    if (ratio >= 3) return "Overwhelming";
    if (ratio >= 2) return "Superior";
    if (ratio >= 1.5) return "Stronger";
    if (ratio >= 0.75) return "Equivalent";
    if (ratio >= 0.5) return "Inferior";
    return "Pathetic";
  }

  function powerVariant(ratio: number): "negative" | "warning" | "info" | "positive" {
    if (ratio >= 2) return "negative";
    if (ratio >= 1.5) return "warning";
    if (ratio >= 0.75) return "info";
    return "positive";
  }

  // ── Derived data ──

  let totalProblems = $derived(data.summary.critical + data.summary.severe + data.summary.moderate);

  let economyProblems = $derived(data.economy.problems.filter((p) => p.severity !== "healthy"));

  let resourceOverview = $derived(
    data.economy.problems.map((p) => ({
      key: formatResource(p.resource),
      value: `${p.net_per_month >= 0 ? "+" : ""}${p.net_per_month.toFixed(1)}/mo`,
      variant: (p.net_per_month >= 0 ? "positive" : severityVariant(p.severity)) as "positive" | "negative" | "warning" | "info" | "highlight" | "muted",
    }))
  );

  let unhappyFactions = $derived(data.politics.factions.filter((f) => f.severity !== "healthy"));

  let factionBars = $derived(
    data.politics.factions
      .sort((a, b) => a.happiness - b.happiness)
      .map((f) => ({
        label: f.name,
        value: Math.round(f.happiness * 100),
        variant: severityVariant(f.severity) as "positive" | "negative" | "warning" | "info",
      }))
  );

  let threatItems = $derived(
    data.threats.hostile_empires.map((e, i) => ({
      rank: i + 1,
      label: e.name,
      sublabel: `${powerLabel(e.power_ratio)} (${Math.round(e.military_power)}k vs ${Math.round(e.player_military_power)}k)`,
      value: `${e.power_ratio.toFixed(1)}x`,
      variant: powerVariant(e.power_ratio) as "positive" | "negative" | "highlight" | "info" | "warning" | "muted",
      badge: { label: threatReason(e.reason), variant: threatReasonVariant(e.reason) as "negative" | "warning" | "info" | "muted" | "positive" | "highlight" | "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor" },
    }))
  );

  let fleetStats = $derived([
    { key: "Fleet Size", value: data.military.fleet_size.toLocaleString() },
    { key: "Naval Capacity Used", value: data.military.naval_used.toLocaleString() },
  ]);
</script>

<Panel>
  <div class="health-layout">
    <!-- ═══ Hero Summary ═══ -->
    <Section
      title="Empire Health"
      accent={totalProblems === 0 ? "var(--color-positive)" : data.summary.critical > 0 ? "var(--color-negative)" : "var(--color-warning)"}
    >
      <div class="hero-row">
        <Stat value={data.summary.critical} label="Critical" variant={data.summary.critical > 0 ? "negative" : "muted"} />
        <Stat value={data.summary.severe} label="Severe" variant={data.summary.severe > 0 ? "warning" : "muted"} />
        <Stat value={data.summary.moderate} label="Moderate" variant={data.summary.moderate > 0 ? "info" : "muted"} />
        <Stat value={data.summary.healthy_dimensions} label="Healthy" variant="positive" />
      </div>
    </Section>

    <!-- ═══ Economy ═══ -->
    <Section
      title="Economy"
      accent={sectionAccent(data.economy.problems)}
      count={economyProblems.length > 0 ? economyProblems.length : undefined}
    >
      {#if economyProblems.length === 0}
        <KeyValue items={resourceOverview} columns={2} />
        <div class="all-clear" style="margin-top: var(--space-sm)">
          <Badge label="All Clear" variant="positive" />
          <span class="all-clear-text">All resources are in surplus</span>
        </div>
      {:else}
        <KeyValue items={resourceOverview} columns={2} />
        <div class="economy-details">
          {#each economyProblems as prob}
            <Panel nested compact>
              <div class="card-title">
                <span class="resource-name">{formatResource(prob.resource)}</span>
                <Badge label={prob.severity} variant={severityVariant(prob.severity)} />
              </div>
              <div class="deficit-stats">
                <div class="deficit-stat">
                  <span class="deficit-label">Stockpile</span>
                  <span class="deficit-value">{prob.stockpile.toLocaleString()}</span>
                </div>
                <div class="deficit-stat">
                  <span class="deficit-label">Runway</span>
                  <span class="deficit-value" class:deficit-danger={prob.runway_months != null && prob.runway_months < 12} class:deficit-empty={prob.runway_months == null}>
                    {prob.runway_months != null ? `${prob.runway_months} mo` : "Empty"}
                  </span>
                </div>
                <div class="deficit-stat">
                  <span class="deficit-label">Net/Mo</span>
                  <span class="deficit-value deficit-danger">{prob.net_per_month.toFixed(1)}</span>
                </div>
              </div>
              {#if prob.top_expenses.length > 0}
                <div class="expense-row">
                  <span class="expense-label">Top expenses</span>
                  <div class="chip-row">
                    {#each prob.top_expenses.slice(0, 3) as exp}
                      <span class="chip">{formatCategory(exp.category)}: {exp.amount.toFixed(0)}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </Panel>
          {/each}
        </div>
      {/if}
    </Section>

    <!-- ═══ Stability ═══ -->
    <Section
      title="Stability"
      accent={sectionAccent(data.stability.planets)}
      count={data.stability.problem_count > 0 ? data.stability.problem_count : undefined}
    >
      {#if data.stability.planets.length === 0}
        <div class="all-clear">
          <Badge label="All Clear" variant="positive" />
          <span class="all-clear-text">All colonies are stable</span>
        </div>
      {:else}
        <CardGrid minWidth={220}>
          {#each data.stability.planets as planet}
            <Panel nested compact>
              <div class="card-title">
                <span class="planet-name">{planet.name}</span>
                <Badge label={planet.severity} variant={severityVariant(planet.severity)} />
              </div>
              <div class="stability-gauge">
                <ProgressBar
                  value={planet.stability}
                  max={100}
                  label="{Math.round(planet.stability)}%"
                  variant={planet.stability < 25 ? "negative" : planet.stability < 50 ? "warning" : "positive"}
                  height={12}
                />
              </div>
              <div class="planet-stats">
                <KeyValue items={[
                  { key: "Housing", value: planet.free_housing >= 0 ? `+${planet.free_housing}` : `${planet.free_housing}`, variant: planet.free_housing < 0 ? "negative" as const : "positive" as const },
                  { key: "Crime", value: `${Math.round(planet.crime)}%`, variant: planet.crime > 30 ? "negative" as const : "muted" as const },
                  { key: "Amenities", value: planet.amenities_surplus >= 0 ? `+${planet.amenities_surplus.toFixed(0)}` : `${planet.amenities_surplus.toFixed(0)}`, variant: planet.amenities_surplus < 0 ? "warning" as const : "muted" as const },
                ]} columns={2} />
              </div>
              {#if planet.issues.length > 0}
                <div class="chip-row" style="margin-top: var(--space-xs)">
                  {#each planet.issues as issue}
                    <Badge label={issueLabel(issue)} variant={issueVariant(issue)} />
                  {/each}
                </div>
              {/if}
            </Panel>
          {/each}
        </CardGrid>
      {/if}
    </Section>

    <!-- ═══ Military ═══ -->
    <Section
      title="Military"
      accent={sectionAccent(data.military.wars)}
      count={data.military.wars.length > 0 ? data.military.wars.length : undefined}
    >
      <div class="fleet-section">
        <KeyValue items={fleetStats} columns={2} />
      </div>

      {#if data.military.wars.length === 0}
        <div class="all-clear">
          <Badge label="At Peace" variant="positive" />
          <span class="all-clear-text">No active wars</span>
        </div>
      {:else}
        <div class="war-list">
          {#each data.military.wars as war}
            <Panel nested compact>
              <div class="card-title">
                <span class="war-name">{war.name}</span>
                <Badge label={war.player_side} variant={war.player_side === "attacker" ? "warning" : "info"} />
                <Badge label={war.severity} variant={severityVariant(war.severity)} />
              </div>
              <div class="war-exhaustion">
                <span class="exhaustion-label">War Exhaustion</span>
                <div class="exhaustion-ring">
                  <ProgressRing
                    value={war.war_exhaustion}
                    label="{Math.round(war.war_exhaustion)}%"
                    variant={war.war_exhaustion > 75 ? "negative" : war.war_exhaustion > 50 ? "warning" : "info"}
                    size={64}
                  />
                </div>
              </div>
            </Panel>
          {/each}
        </div>
      {/if}
    </Section>

    <!-- ═══ Politics ═══ -->
    <Section
      title="Politics"
      accent={sectionAccent(data.politics.factions)}
      count={unhappyFactions.length > 0 ? unhappyFactions.length : undefined}
    >
      {#if data.politics.factions.length === 0}
        <div class="all-clear">
          <Badge label="All Clear" variant="positive" />
          <span class="all-clear-text">No faction unrest</span>
        </div>
      {:else}
        <BarChart items={factionBars} maxValue={100} />
        {#if unhappyFactions.length > 0}
          <div class="faction-badges">
            {#each unhappyFactions as f}
              <div class="faction-tag">
                <Badge label={f.faction_type} variant={severityVariant(f.severity)} />
                <span class="faction-support">{Math.round(f.support * 100)}% support</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </Section>

    <!-- ═══ External Threats ═══ -->
    <Section
      title="External Threats"
      accent={data.threats.crisis_active ? "var(--color-negative)" : sectionAccent(data.threats.hostile_empires)}
      count={data.threats.hostile_empires.length > 0 ? data.threats.hostile_empires.length : undefined}
    >
      {#if data.threats.crisis_active}
        <div class="crisis-banner">
          <Badge label="Active Crisis" variant="negative" />
          <span class="crisis-type">{formatResource(data.threats.crisis_type ?? "unknown")}</span>
        </div>
      {/if}

      {#if data.threats.hostile_empires.length === 0 && !data.threats.crisis_active}
        <div class="all-clear">
          <Badge label="All Clear" variant="positive" />
          <span class="all-clear-text">No external threats detected</span>
        </div>
      {:else if data.threats.hostile_empires.length > 0}
        <RankedList items={threatItems} />
      {/if}
    </Section>
  </div>
</Panel>

<style>
  .health-layout { display: flex; flex-direction: column; gap: 24px; }
  .hero-row { display: flex; gap: var(--space-xl); justify-content: center; padding: var(--space-sm) 0; }

  /* ── All-clear state ── */

  .all-clear {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-sm);
    background: color-mix(in srgb, var(--color-positive) 6%, transparent);
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--color-positive) 15%, transparent);
  }

  .all-clear-text {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-positive);
    font-weight: 500;
  }

  /* ── Card titles ── */

  .card-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .resource-name,
  .planet-name,
  .war-name {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  /* ── Economy ── */

  .economy-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .deficit-stats {
    display: flex;
    gap: var(--space-lg);
    padding: var(--space-sm) var(--space-md);
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-xs);
  }

  .deficit-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .deficit-label {
    font-family: var(--font-pixel);
    font-size: 8px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .deficit-value {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
  }

  .deficit-danger {
    color: var(--color-negative);
  }

  .deficit-empty {
    color: var(--color-negative);
    font-style: italic;
  }

  .expense-row {
    margin-top: var(--space-xs);
  }

  .expense-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    display: block;
    margin-bottom: 4px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-border) 15%, transparent);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  /* ── Stability ── */

  .stability-gauge {
    margin-bottom: var(--space-xs);
  }

  .planet-stats {
    margin-top: var(--space-xs);
  }

  /* ── Military ── */

  .fleet-section {
    margin-bottom: var(--space-md);
  }

  .war-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .war-exhaustion {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
  }

  .exhaustion-label {
    font-family: var(--font-pixel);
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }

  .exhaustion-ring {
    display: flex;
    justify-content: center;
    flex: 1;
  }

  /* ── Politics ── */

  .faction-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .faction-tag {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .faction-support {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /* ── External Threats ── */

  .crisis-banner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: color-mix(in srgb, var(--color-negative) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-negative) 30%, transparent);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-md);
    animation: crisis-pulse 2s ease-in-out infinite alternate;
  }

  @keyframes crisis-pulse {
    from { border-color: color-mix(in srgb, var(--color-negative) 30%, transparent); }
    to { border-color: color-mix(in srgb, var(--color-negative) 60%, transparent); }
  }

  .crisis-type {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-negative);
  }
</style>
