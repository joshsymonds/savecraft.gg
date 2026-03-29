<!--
  @component
  D2R drop calculator reference view.
  Three modes: monster drops, item sources, item search.
-->
<script lang="ts">
  import Badge from "../../../../views/src/components/data/Badge.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import KeyValue from "../../../../views/src/components/data/KeyValue.svelte";
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import CardGrid from "../../../../views/src/components/layout/CardGrid.svelte";
  import CollapseToggle from "../../../../views/src/components/layout/CollapseToggle.svelte";

  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted"
    | "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor";

  interface Drop {
    name: string;
    base_name: string;
    code: string;
    unique: number;
    set: number;
    rare: number;
    magic: number;
    base_prob: number;
  }

  interface Source {
    monster: string;
    is_boss: boolean;
    difficulty: string;
    tc_type: string;
    area: string;
    mlvl: number;
    chance: number;
  }

  interface SearchItem {
    name: string;
    base_name: string;
    is_set: boolean;
    set_name?: string;
    level_req: number;
    qlevel: number;
    stats: string[];
    top_sources: { monster: string; difficulty: string; chance: number }[];
  }

  interface Props {
    data: {
      mode: "monster" | "item" | "search";
      // Monster mode
      monster_name?: string;
      difficulty?: string;
      mf?: number;
      players?: number;
      drops?: Drop[];
      // Item mode
      item_name?: string;
      item_base?: string;
      quality?: string;
      sources?: Source[];
      // Search mode
      query?: string;
      items?: SearchItem[];
      // Shared
      total?: number;
      offset?: number;
      limit?: number;
      icon_url?: string;
    };
  }

  let { data }: Props = $props();

  // --- Quality → variant mapping ---
  function qualityVariant(quality: string): Variant {
    switch (quality) {
      case "unique": return "legendary";
      case "set": return "positive";
      case "rare": return "rare";
      case "magic": return "info";
      default: return "muted";
    }
  }

  // --- Difficulty badge variant ---
  function difficultyVariant(diff: string): Variant {
    switch (diff) {
      case "Hell": return "negative";
      case "Nightmare": return "warning";
      default: return "info";
    }
  }

  // --- Format probability as "1:X" or "—" ---
  function fmtChance(p: number): string {
    if (p <= 0) return "\u2014";
    const n = 1 / p;
    return n < 10 ? `1:${n.toFixed(1)}` : `1:${Math.round(n)}`;
  }

  // --- Chance cell with quality coloring ---
  function chanceCell(p: number, variant: Variant): { value: string; variant?: Variant } {
    if (p <= 0) return { value: "\u2014", variant: "muted" };
    return { value: fmtChance(p), variant };
  }

  // --- Monster mode table ---
  let monsterColumns = [
    { key: "rank", label: "#", width: "36px", align: "right" as const },
    { key: "name", label: "Item", sortable: true },
    { key: "base", label: "Base", sortable: true },
    { key: "unique", label: "Unique", align: "right" as const, sortable: true },
    { key: "set", label: "Set", align: "right" as const, sortable: true },
    { key: "rare", label: "Rare", align: "right" as const, sortable: true },
    { key: "magic", label: "Magic", align: "right" as const, sortable: true },
    { key: "base_prob", label: "Base", align: "right" as const, sortable: true },
  ];

  let monsterRows = $derived(
    (data.drops ?? []).map((d, i) => ({
      rank: i + 1 + (data.offset ?? 0),
      name: { value: d.name, variant: (d.unique > 0 ? "legendary" : d.set > 0 ? "positive" : "muted") as Variant },
      base: d.base_name,
      unique: chanceCell(d.unique, "legendary"),
      set: chanceCell(d.set, "positive"),
      rare: chanceCell(d.rare, "rare"),
      magic: chanceCell(d.magic, "info"),
      base_prob: chanceCell(d.base_prob, "muted"),
    })),
  );

  let monsterContext = $derived.by(() => {
    const parts: { key: string; value: string }[] = [];
    if (data.difficulty) parts.push({ key: "Difficulty", value: data.difficulty });
    if (data.mf != null) parts.push({ key: "Magic Find", value: `${data.mf}%` });
    if (data.players != null) parts.push({ key: "Players", value: `${data.players}` });
    if (data.total != null) parts.push({ key: "Total items", value: `${data.total}` });
    return parts;
  });

  // --- Item mode table ---
  let sourceColumns = [
    { key: "rank", label: "#", width: "36px", align: "right" as const },
    { key: "monster", label: "Monster", sortable: true },
    { key: "difficulty", label: "Diff", sortable: true },
    { key: "tc_type", label: "Type", sortable: true },
    { key: "area", label: "Area", sortable: true },
    { key: "mlvl", label: "mLvl", align: "right" as const, sortable: true },
    { key: "chance", label: "Chance", align: "right" as const, sortable: true },
  ];

  function tcTypeVariant(tc: string): Variant {
    switch (tc) {
      case "Quest": return "legendary";
      case "Unique": return "rare";
      case "Champion": return "uncommon";
      default: return "muted";
    }
  }

  let sourceRows = $derived(
    (data.sources ?? []).map((s, i) => ({
      rank: i + 1 + (data.offset ?? 0),
      monster: { value: s.monster, variant: (s.is_boss ? "legendary" : "muted") as Variant },
      difficulty: { value: s.difficulty, variant: difficultyVariant(s.difficulty) },
      tc_type: { value: s.tc_type, variant: tcTypeVariant(s.tc_type) },
      area: s.area,
      mlvl: s.mlvl,
      chance: chanceCell(s.chance, qualityVariant(data.quality ?? "unique")),
    })),
  );

  let sourceContext = $derived.by(() => {
    const parts: { key: string; value: string }[] = [];
    if (data.item_base) parts.push({ key: "Base item", value: data.item_base });
    if (data.quality) parts.push({ key: "Quality", value: data.quality.charAt(0).toUpperCase() + data.quality.slice(1) });
    if (data.mf != null) parts.push({ key: "Magic Find", value: `${data.mf}%` });
    if (data.total != null) parts.push({ key: "Total sources", value: `${data.total}` });
    return parts;
  });

  // --- Search mode: mini source table per card ---
  let miniSourceColumns = [
    { key: "rank", label: "#", width: "30px", align: "right" as const },
    { key: "monster", label: "Monster", sortable: true },
    { key: "difficulty", label: "Diff", sortable: true },
    { key: "chance", label: "Chance", align: "right" as const, sortable: true },
  ];

  function miniSourceRows(sources: SearchItem["top_sources"], isSet: boolean) {
    const chanceVariant: Variant = isSet ? "positive" : "legendary";
    return sources.map((src, i) => ({
      rank: i + 1,
      monster: src.monster,
      difficulty: { value: src.difficulty, variant: difficultyVariant(src.difficulty) },
      chance: chanceCell(src.chance, chanceVariant),
    }));
  }

  // --- Search mode: item metadata as KeyValue ---
  function itemMeta(item: SearchItem) {
    const parts: { key: string; value: string; variant?: Variant }[] = [];
    parts.push({ key: "Base", value: item.base_name });
    if (item.is_set && item.set_name) parts.push({ key: "Set", value: item.set_name, variant: "positive" });
    if (item.level_req > 0) parts.push({ key: "Req Level", value: `${item.level_req}` });
    return parts;
  }

  // --- Pagination ---
  let showingRange = $derived.by(() => {
    const total = data.total ?? 0;
    const offset = data.offset ?? 0;
    const limit = data.limit ?? 50;
    if (total <= limit) return "";
    return `Showing ${offset + 1}\u2013${Math.min(offset + limit, total)} of ${total}`;
  });
</script>

{#if data.mode === "search"}
  <div class="search-results">
    <CardGrid minWidth={300}>
      {#each data.items ?? [] as item}
        <Panel compact>
          <div class="item-card">
            <div class="item-header">
              <span class="item-name" class:is-unique={!item.is_set} class:is-set={item.is_set}>{item.name}</span>
              <Badge label={item.is_set ? "SET" : "UNIQUE"} variant={item.is_set ? "positive" : "legendary"} />
            </div>

            <KeyValue items={itemMeta(item)} />

            {#if item.stats.length > 0}
              <Panel nested>
                <span class="sub-label">Properties</span>
                <ul class="stat-list">
                  {#each item.stats as stat}
                    <li>{stat}</li>
                  {/each}
                </ul>
              </Panel>
            {/if}

            {#if item.top_sources.length > 0}
              <CollapseToggle label="{item.top_sources.length} drop sources">
                <DataTable
                  columns={miniSourceColumns}
                  rows={miniSourceRows(item.top_sources, item.is_set)}
                  sortKey="chance"
                  sortDir="desc"
                />
              </CollapseToggle>
            {/if}
          </div>
        </Panel>
      {/each}
    </CardGrid>
  </div>
{:else}
<Panel watermark={data.icon_url}>
  {#if data.mode === "monster"}
    <Section title={data.monster_name ?? "Monster"}>
      {#snippet badge()}
        {#if data.difficulty}
          <Badge label={data.difficulty.toUpperCase()} variant={difficultyVariant(data.difficulty)} />
        {/if}
      {/snippet}

      <div class="mode-layout">
        <KeyValue items={monsterContext} columns={2} />
        <DataTable columns={monsterColumns} rows={monsterRows} sortKey="unique" sortDir="desc" />
        {#if showingRange}
          <p class="pagination">{showingRange}</p>
        {/if}
      </div>
    </Section>
  {:else if data.mode === "item"}
    <Section title={data.item_name ?? "Item"}>
      {#snippet badge()}
        {#if data.quality}
          <Badge label={data.quality.toUpperCase()} variant={qualityVariant(data.quality)} />
        {/if}
      {/snippet}

      <div class="mode-layout">
        <KeyValue items={sourceContext} columns={2} />
        <DataTable columns={sourceColumns} rows={sourceRows} sortKey="chance" sortDir="desc" />
        {#if showingRange}
          <p class="pagination">{showingRange}</p>
        {/if}
      </div>
    </Section>
  {/if}
</Panel>
{/if}

<style>
  .search-results {
    padding: var(--space-lg);
    animation: fade-slide-in 0.3s ease-out;
  }

  .mode-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .pagination {
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: center;
    margin: 0;
  }

  .item-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
  }

  .item-name {
    font-family: var(--font-heading);
    font-size: 16px;
    font-weight: 700;
  }

  .item-name.is-unique {
    color: var(--color-rarity-legendary);
  }

  .item-name.is-set {
    color: var(--color-positive);
  }

  .stat-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-list li {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-info);
    padding-left: var(--space-md);
    position: relative;
  }

  .stat-list li::before {
    content: "\2022";
    position: absolute;
    left: 0;
    color: var(--color-text-muted);
  }
</style>
