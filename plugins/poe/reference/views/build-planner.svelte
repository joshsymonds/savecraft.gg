<!--
  @component
  Path of Building build dashboard.
  Renders character info, summary stats, and dynamically requested detail sections.
  Sections are only shown if present in structuredContent (AI controls via sections param).
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import Stat from "../../../../views/src/components/data/Stat.svelte";
  import StatRow from "../../../../views/src/components/data/StatRow.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import SocketGroup from "../../../../views/src/components/poe/SocketGroup.svelte";
  import ItemSlot from "../../../../views/src/components/poe/ItemSlot.svelte";
  import { classAccent } from "../../../../views/src/components/poe/colors";

  interface Change {
    before: number;
    after: number;
    delta: number;
  }

  interface Props {
    data: {
      icon_url?: string;
      buildId?: string;
      data: {
        character: {
          class: string;
          ascendancy: string;
          level: number;
          bandit?: string;
        };
        summary: Record<string, number>;
        changes?: Record<string, Change>;
        section_index?: Array<{ id: string; name: string; description: string }>;
        sections?: Record<string, unknown>;
      };
    };
  }

  let { data }: Props = $props();

  let character = $derived(data.data.character);
  let summary = $derived(data.data.summary);
  let changes = $derived(data.data.changes);
  let sections = $derived(data.data.sections ?? {});
  let accent = $derived(classAccent(character.ascendancy || character.class));
  let isDeltaMode = $derived(changes != null && Object.keys(changes).length > 0);

  // Section metadata for display names
  const SECTION_NAMES: Record<string, string> = {
    offense: "Offense",
    ailments: "Ailments",
    defense: "Defense",
    resistances: "Resistances",
    ehp: "Effective HP",
    recovery: "Recovery",
    charges: "Charges",
    limits: "Limits",
    minion_offense: "Minion Offense",
    minion_defense: "Minion Defense",
  };

  // Stat sections are key-value maps rendered with KeyValue
  const STAT_SECTION_IDS = new Set([
    "offense", "ailments", "defense", "resistances",
    "ehp", "recovery", "charges", "limits",
    "minion_offense", "minion_defense",
  ]);

  // Format large numbers for display
  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
    if (n >= 1_000) return n.toLocaleString();
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(1);
  }

  // Format stat keys into readable labels
  function formatStatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .replace(/D P S/g, "DPS")
      .replace(/E S/g, "ES")
      .replace(/E H P/g, "EHP")
      .replace(/Do T/g, "DoT")
      .replace(/Ao E/g, "AoE")
      .trim();
  }

  // Format a delta value with sign prefix
  function formatDelta(n: number): string {
    const sign = n > 0 ? "+" : "";
    return `${sign}${formatNumber(n)}`;
  }

  // Convert a stat section (Record<string, number>) to KeyValue items
  function statToItems(section: Record<string, number>): Array<{ key: string; value: string | number; variant?: string }> {
    return Object.entries(section)
      .filter(([, v]) => typeof v === "number" && v !== 0)
      .map(([k, v]) => ({
        key: formatStatKey(k),
        value: formatNumber(v),
      }));
  }

  // Character subtitle line
  let subtitle = $derived.by(() => {
    const parts: string[] = [];
    if (character.ascendancy && character.ascendancy !== character.class) {
      parts.push(`${character.ascendancy} (${character.class})`);
    } else {
      parts.push(character.class);
    }
    parts.push(`Level ${character.level}`);
    if (character.bandit) parts.push(`Bandit: ${character.bandit}`);
    return parts.join(" · ");
  });

  // Ordered stat section IDs present in the response
  let statSectionIds = $derived(
    Object.keys(sections).filter((id) => STAT_SECTION_IDS.has(id))
  );

  // Structured sections
  let socketGroups = $derived(sections.socket_groups as Array<{
    label: string; enabled: boolean; slot: string;
    gems: Array<{ name?: string; nameSpec?: string; level?: number; quality?: number; enabled?: boolean; support?: boolean }>;
    isMainGroup: boolean;
  }> | undefined);

  let items = $derived(sections.items as Record<string, {
    name: string; baseName?: string; rarity: string; type?: string;
  }> | undefined);

  let keystones = $derived(sections.keystones as string[] | undefined);

  let tree = $derived(sections.tree as {
    version?: number; allocated_nodes?: number; ascendancy_nodes?: number;
    level_points?: number; quest_points?: number; extra_points?: number;
    available_points?: number; remaining_points?: number;
  } | undefined);
</script>

<div class="build-planner">
  <!-- Character header -->
  <Panel watermark={data.icon_url} accent={accent}>
    <Section title={character.ascendancy || character.class} subtitle={subtitle} accent={accent}>
      {#snippet icons()}
        <Badge label="PoB" variant={isDeltaMode ? "info" : "muted"} />
      {/snippet}

      {#if isDeltaMode && changes}
        <!-- Delta-only mode: show what changed -->
        <div class="delta-panel">
          {#each Object.entries(changes) as [key, change]}
            <div class="delta-row">
              <span class="delta-label">{formatStatKey(key)}</span>
              <span class="delta-values">
                <span class="delta-before">{formatNumber(change.before)}</span>
                <span class="delta-arrow">&rarr;</span>
                <span class="delta-after">{formatNumber(change.after)}</span>
              </span>
              <span
                class="delta-diff"
                class:positive={change.delta > 0}
                class:negative={change.delta < 0}
              >{formatDelta(change.delta)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Normal mode: summary stats -->
        <StatRow justify="center" gap="var(--space-xl)">
          {#if summary.CombinedDPS != null}
            <Stat value={formatNumber(summary.CombinedDPS)} label="DPS" variant="highlight" />
          {/if}
          {#if summary.Life != null}
            <Stat value={formatNumber(summary.Life)} label="Life" variant="positive" />
          {/if}
          {#if summary.EnergyShield != null && summary.EnergyShield > 0}
            <Stat value={formatNumber(summary.EnergyShield)} label="ES" variant="info" />
          {/if}
          {#if summary.Mana != null}
            <Stat value={formatNumber(summary.Mana)} label="Mana" variant="info" />
          {/if}
        </StatRow>

        <!-- Resist + defense row -->
        <div class="resist-row">
          {#if summary.FireResist != null}
            <span class="resist fire">{summary.FireResist}%</span>
          {/if}
          {#if summary.ColdResist != null}
            <span class="resist cold">{summary.ColdResist}%</span>
          {/if}
          {#if summary.LightningResist != null}
            <span class="resist lightning">{summary.LightningResist}%</span>
          {/if}
          {#if summary.ChaosResist != null}
            <span class="resist chaos">{summary.ChaosResist}%</span>
          {/if}
          {#if summary.Armour != null && summary.Armour > 0}
            <span class="defense-stat">{formatNumber(summary.Armour)} Armour</span>
          {/if}
          {#if summary.Evasion != null && summary.Evasion > 0}
            <span class="defense-stat">{formatNumber(summary.Evasion)} Evasion</span>
          {/if}
          {#if summary.BlockChance != null && summary.BlockChance > 0}
            <span class="defense-stat">{summary.BlockChance}% Block</span>
          {/if}
          {#if summary.SpellSuppressionChance != null && summary.SpellSuppressionChance > 0}
            <span class="defense-stat">{summary.SpellSuppressionChance}% Supp</span>
          {/if}
        </div>

        <!-- Attributes row -->
        {#if summary.Str != null || summary.Dex != null || summary.Int != null}
          <div class="attr-row">
            {#if summary.Str != null}<span class="attr str">{summary.Str} Str</span>{/if}
            {#if summary.Dex != null}<span class="attr dex">{summary.Dex} Dex</span>{/if}
            {#if summary.Int != null}<span class="attr int">{summary.Int} Int</span>{/if}
          </div>
        {/if}
      {/if}
    </Section>
  </Panel>

  {#if !isDeltaMode}
    <!-- Dynamic stat sections -->
    {#each statSectionIds as sectionId}
      {@const sectionData = sections[sectionId] as Record<string, number>}
      {@const kvItems = statToItems(sectionData)}
      {#if kvItems.length > 0}
        <Panel watermark={data.icon_url} accent={accent}>
          <Section title={SECTION_NAMES[sectionId] ?? sectionId} accent={accent}>
            <KeyValue items={kvItems} columns={2} />
          </Section>
        </Panel>
      {/if}
    {/each}

    <!-- Socket Groups -->
    {#if socketGroups && socketGroups.length > 0}
      <Panel watermark={data.icon_url} accent={accent}>
        <Section title="Socket Groups" accent={accent}>
          <div class="socket-groups">
            {#each socketGroups as group}
              <SocketGroup
                gems={group.gems}
                label={group.label}
                slot={group.slot}
                isMainGroup={group.isMainGroup}
                enabled={group.enabled}
              />
            {/each}
          </div>
        </Section>
      </Panel>
    {/if}

    <!-- Items -->
    {#if items && Object.keys(items).length > 0}
      <Panel watermark={data.icon_url} accent={accent}>
        <Section title="Equipment" accent={accent}>
          <div class="items">
            {#each Object.entries(items) as [slot, item]}
              <ItemSlot
                {slot}
                name={item.name}
                baseName={item.baseName}
                rarity={item.rarity}
                type={item.type}
              />
            {/each}
          </div>
        </Section>
      </Panel>
    {/if}

    <!-- Keystones -->
    {#if keystones && keystones.length > 0}
      <Panel watermark={data.icon_url} accent={accent}>
        <Section title="Keystones" accent={accent}>
          <div class="keystones">
            {#each keystones as keystone}
              <Badge label={keystone} variant="warning" />
            {/each}
          </div>
        </Section>
      </Panel>
    {/if}

    <!-- Passive Tree -->
    {#if tree}
      <Panel watermark={data.icon_url} accent={accent}>
        <Section title="Passive Tree" accent={accent}>
          <StatRow justify="center" gap="var(--space-xl)">
            {#if tree.allocated_nodes != null && tree.available_points != null}
              <Stat value="{tree.allocated_nodes} / {tree.available_points}" label="Allocated" variant="highlight" />
            {:else if tree.allocated_nodes != null}
              <Stat value={tree.allocated_nodes} label="Allocated" variant="highlight" />
            {/if}
            {#if tree.remaining_points != null}
              <Stat
                value={tree.remaining_points}
                label="Remaining"
                variant={tree.remaining_points < 0 ? "negative" : tree.remaining_points > 0 ? "positive" : "muted"}
              />
            {/if}
          </StatRow>
          {#if tree.level_points != null && tree.quest_points != null}
            <div class="tree-breakdown">
              {tree.level_points} level + {tree.quest_points} quest{#if tree.extra_points} + {tree.extra_points} extra{/if} = {tree.available_points} points
            </div>
          {/if}
        </Section>
      </Panel>
    {/if}
  {/if}

  <!-- Allocation log — shown in both delta and normal modes -->
  {#if sections.allocation_log}
    {@const log = sections.allocation_log as Array<{ target: string; points_spent: number; path: Array<{ name: string; type: string }> }>}
    <Panel watermark={data.icon_url} accent={accent}>
      <Section title="Allocation Log" accent={accent}>
        {#each log as entry}
          <div class="alloc-entry">
            <div class="alloc-header">
              <span class="alloc-target">{entry.target}</span>
              <span class="alloc-cost">{entry.points_spent} points</span>
            </div>
            <div class="alloc-path">
              {#each entry.path as node, i}
                {#if i > 0}<span class="alloc-sep">&rarr;</span>{/if}
                <span class="alloc-node" class:notable={node.type === "notable"} class:keystone={node.type === "keystone"}>{node.name}</span>
              {/each}
            </div>
          </div>
        {/each}
      </Section>
    </Panel>
  {/if}
</div>

<style>
  .build-planner {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }


  .resist-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-md);
    justify-content: center;
    padding: var(--space-xs) 0;
  }

  .resist {
    font-family: var(--font-heading);
    font-size: 14px;
    font-weight: 700;
  }

  .resist.fire { color: #e85a4a; }
  .resist.cold { color: #4a8ad0; }
  .resist.lightning { color: #e8d9a0; }
  .resist.chaos { color: #b47aee; }

  .defense-stat {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  .attr-row {
    display: flex;
    gap: var(--space-md);
    justify-content: center;
    padding: var(--space-xs) 0;
  }

  .attr {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
  }

  .attr.str { color: #e85a4a; }
  .attr.dex { color: #5abe6a; }
  .attr.int { color: #4a8ad0; }

  .socket-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .items {
    display: flex;
    flex-direction: column;
  }

  .keystones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .tree-breakdown {
    text-align: center;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
    padding-top: var(--space-xs);
  }

  /* Delta panel */
  .delta-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: var(--space-xs) 0;
  }

  .delta-row {
    display: flex;
    align-items: baseline;
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .delta-row:nth-child(even) {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  .delta-label {
    flex: 1;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .delta-values {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-dim);
    margin-right: var(--space-md);
  }

  .delta-arrow {
    margin: 0 var(--space-xs);
    color: var(--color-text-muted);
  }

  .delta-diff {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    min-width: 70px;
    text-align: right;
  }

  .delta-diff.positive { color: var(--color-positive); }
  .delta-diff.negative { color: var(--color-negative); }

  /* Allocation log */
  .alloc-entry {
    padding: var(--space-xs) 0;
  }

  .alloc-entry + .alloc-entry {
    border-top: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  .alloc-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: var(--space-xs);
  }

  .alloc-target {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 600;
  }

  .alloc-cost {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
  }

  .alloc-path {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-dim);
  }

  .alloc-sep {
    color: var(--color-text-muted);
  }

  .alloc-node.notable {
    color: var(--color-highlight);
    font-weight: 500;
  }

  .alloc-node.keystone {
    color: var(--color-warning);
    font-weight: 600;
  }
</style>
