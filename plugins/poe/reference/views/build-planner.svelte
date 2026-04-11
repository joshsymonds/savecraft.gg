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
        section_index?: Array<{ id: string; name: string; description: string }>;
        sections?: Record<string, unknown>;
      };
    };
  }

  let { data }: Props = $props();

  let character = $derived(data.data.character);
  let summary = $derived(data.data.summary);
  let sections = $derived(data.data.sections ?? {});
  let accent = $derived(classAccent(character.ascendancy || character.class));

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

  // Convert a stat section (Record<string, number>) to KeyValue items
  function statToItems(section: Record<string, number>): Array<{ key: string; value: string | number; variant?: string }> {
    return Object.entries(section)
      .filter(([, v]) => typeof v === "number" && v !== 0)
      .map(([k, v]) => ({
        key: formatStatKey(k),
        value: formatNumber(v),
      }));
  }

  // Resist variant based on capped vs uncapped
  function resistVariant(value: number): "positive" | "warning" | "negative" | "muted" {
    if (value >= 75) return "positive";
    if (value >= 0) return "warning";
    return "negative";
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

  let tree = $derived(sections.tree as { version?: number; allocated_nodes?: number } | undefined);
</script>

<div class="build-planner">
  <!-- Character header + summary stats -->
  <Panel watermark={data.icon_url} accent={accent}>
    <Section title={character.ascendancy || character.class} subtitle={subtitle} accent={accent}>
      {#snippet icons()}
        <Badge label="PoB" variant="muted" />
      {/snippet}
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
    </Section>
  </Panel>

  <!-- Dynamic stat sections -->
  {#each statSectionIds as sectionId}
    {@const sectionData = sections[sectionId] as Record<string, number>}
    {@const items = statToItems(sectionData)}
    {#if items.length > 0}
      <Panel watermark={data.icon_url} accent={accent}>
        <Section title={SECTION_NAMES[sectionId] ?? sectionId} accent={accent}>
          <KeyValue {items} columns={2} />
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
        <div class="tree-info">
          {#if tree.allocated_nodes != null}
            <Stat value={tree.allocated_nodes} label="Allocated Nodes" variant="highlight" />
          {/if}
        </div>
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

  .tree-info {
    display: flex;
    justify-content: center;
    padding: var(--space-sm) 0;
  }
</style>
