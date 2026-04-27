<!--
  @component
  Path of Building build comparison view. Renders the N-build /compare
  response as a single comparison artifact: one Panel + Section gold
  header, then a GroupedTable whose columns are the builds and whose
  row groups are the four comparison dimensions (Summary / Allocated
  Tree / Gear / Skills). Buy-similar lives in a separate Panel below
  when present.

  Data contract: matches CompareResponse from cmd/pob-server/compare.go.
  Diffs are computed across the SUCCESSFUL build subset; errored slots
  appear in `builds` but not in `diffs.*.perBuild`.

  Composed entirely from shared components in views/src/components/.
  No custom CSS in this file.
-->
<script lang="ts">
  import Panel from "../../../../views/src/components/layout/Panel.svelte";
  import Section from "../../../../views/src/components/layout/Section.svelte";
  import DataTable from "../../../../views/src/components/data/DataTable.svelte";
  import GroupedTable from "../../../../views/src/components/data/GroupedTable.svelte";
  import PassiveTreeOverlay from "./passive-tree-overlay.svelte";

  // Per-build palette for the tree overlay. Same order as
  // passive-tree-overlay.stories.svelte's allocation stories — the
  // palette is consistent across views so a build's "color" stays the
  // same whether you're looking at a 2-build or 3-build comparison.
  // 8 entries match the maxCompareBuilds cap from the server.
  const TREE_OVERLAY_PALETTE = [
    "#27ae60", "#e74c3c", "#3498db", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#8e44ad",
  ];

  interface CompareBuild {
    id?: string;
    label: string;
    character?: { class: string; ascendancy?: string; level: number };
    summary?: Record<string, number>;
    // tree.allocatedNodeIds is the per-build allocation set used by
    // the visual passive-tree overlay panel below the comparison
    // table. Mirrors the wire shape from compareBuildEntry.Tree.
    tree?: { allocatedNodeIds: number[] };
    error?: string;
  }

  interface StatDiff {
    perBuild: number[];
    leader: number;
    range: number;
  }

  interface TreeDiff {
    // Indexed parallel to builds[] — entry i carries the nodes unique
    // to builds[i]. Failed slots and slots without tree data get [] at
    // their index, so `allocatedOnlyIn[builds.indexOf(b)]` always
    // returns a defined array regardless of build success.
    allocatedOnlyIn: number[][];
    common: number[];
  }

  interface SlotDiff {
    perBuild: Array<string | null>;
    nameSame: boolean;
    modsSame: boolean;
  }

  interface SocketGroupDiff {
    label: string;
    perBuild: string[][];
    same: boolean;
  }

  // Config values are heterogeneous: number (enemyLevel: 84), boolean
  // (raiseSpectreEnableBuffs: true), or short string (enemyIsBoss:
  // "Pinnacle"). A null at perBuild[i] means build i didn't have this
  // key set — distinct from numeric 0 / boolean false / empty string.
  // Same-value entries are filtered server-side; every entry the view
  // sees represents a real divergence.
  type ConfigValue = number | boolean | string | null;

  interface ConfigDiffEntry {
    key: string;
    perBuild: ConfigValue[];
    same: boolean;
  }

  // ModSourceDiffEntry mirrors compareModSourceDiffEntry from the Go side
  // (cmd/pob-server/compare.go). Each entry is one row of a per-stat
  // modifier-source diff: which item / tree node / skill / pantheon
  // contributes to a stat, where the contribution differs across builds.
  // perBuild[i] is null when build i has no row matching this key.
  interface ModSourceCell {
    source_name: string;
    mod_name: string;
    value: number;
  }

  interface ModSourceDiffEntry {
    key: string;
    source_type: string;
    mod_type: string;
    perBuild: Array<ModSourceCell | null>;
  }

  interface BuySimilarEntry {
    fromBuildId: string;
    toBuildId: string;
    slot: string;
    itemName: string;
    tradeUrl: string;
  }

  interface Diffs {
    summary?: Record<string, StatDiff>;
    tree?: TreeDiff;
    gear?: Record<string, SlotDiff>;
    skills?: SocketGroupDiff[];
    config?: ConfigDiffEntry[];
    modSources?: Record<string, ModSourceDiffEntry[]>;
  }

  interface Props {
    data: {
      builds: CompareBuild[];
      diffs?: Diffs;
      buySimilar?: BuySimilarEntry[];
    };
  }

  let { data }: Props = $props();

  let builds = $derived(data.builds ?? []);
  let diffs = $derived(data.diffs);
  let buySimilar = $derived(data.buySimilar);
  let hasBuySimilar = $derived((buySimilar?.length ?? 0) > 0);
  let successCount = $derived(builds.filter((b) => !b.error).length);
  let erroredBuilds = $derived(builds.filter((b) => b.error));

  // Per-build allocation set for the visual tree overlay panel. Only
  // successful builds with non-empty allocated_node_ids contribute;
  // each gets a color from the TREE_OVERLAY_PALETTE indexed by their
  // position in the successful-subset (consistent with how the
  // GroupedTable columns are ordered).
  let treeAllocations = $derived.by(() => {
    return builds
      .filter((b) => !b.error && b.tree?.allocatedNodeIds?.length)
      .map((b, i) => ({
        id: b.id ?? b.label,
        label: buildColumnLabel(b),
        color: TREE_OVERLAY_PALETTE[i % TREE_OVERLAY_PALETTE.length],
        nodeIds: b.tree!.allocatedNodeIds,
      }));
  });
  let hasTreeOverlay = $derived(treeAllocations.length >= 2);

  // The successful subset is what diff.perBuild arrays are indexed
  // against. Errored builds appear in `builds` AND get their own column
  // (in errored state with muted "—" cells), so the user can see which
  // builds failed without losing the diff against the rest.
  let successful = $derived(builds.filter((b) => !b.error));

  type Variant = "highlight" | "muted" | "negative" | "positive";
  type CellValue =
    | string
    | number
    | {
        value: string | number;
        variant?: Variant;
        sublabel?: string;
        sublabelVariant?: Variant;
        sublabelPosition?: "below" | "left";
      };

  // Pin/anchor model: one build is the "anchor", every other successful
  // build's Summary cells get a small delta sublabel showing their value
  // relative to the anchor. Default anchor is the first successful build
  // (positional, deterministic). Click-to-re-anchor wires up next; for
  // now this is a static visual.
  let anchorIdx = $state(0);

  // One column per build (successful AND errored), preserving the
  // original `builds` order. Errored columns use variant: "negative"
  // and a "errored" sublabel; the anchor build's column gets an "anchor"
  // sublabel so the user can see which baseline the deltas reference.
  let columns = $derived([
    { key: "axis", label: "", align: "left" as const, width: "30%" },
    ...builds.map((b) => {
      const successIdx = successful.indexOf(b);
      const isAnchor = successIdx >= 0 && successIdx === anchorIdx;
      const isErrored = !!b.error;
      // Sublabel disambiguates columns when class+level happen to
      // match across builds (e.g. two Scion L99s). Errored builds keep
      // the "errored" tag instead — the user already knows what failed
      // from the subtitle.
      const idLabel = b.label || b.id?.slice(0, 8) || "";
      return {
        key: `b${b.id ?? b.label}`,
        label: buildColumnLabel(b),
        align: "right" as const,
        // Errored columns retain their red-tinted treatment; the anchor
        // column gets the gold-tinted column background plus a left-side
        // lock icon (rendered by GroupedTable when pinned: true).
        variant: isErrored ? ("negative" as const) : isAnchor ? ("highlight" as const) : undefined,
        sublabel: isErrored ? "errored" : idLabel || undefined,
        pinned: isAnchor,
        // Click any non-anchor, non-errored column to make it the new
        // anchor. Deltas across the entire Summary section recompute
        // automatically since anchorIdx is reactive state.
        onSelect:
          !isAnchor && !isErrored && successIdx >= 0
            ? () => {
                anchorIdx = successIdx;
              }
            : undefined,
      };
    }),
  ]);

  // Subtitle: surface the failure count and, for a single failure, the
  // actual error message inline. For multiple, defer to per-column
  // sublabels — the message list would crowd the title.
  let subtitle = $derived.by(() => {
    const base = `${builds.length} builds · ${successCount} resolved`;
    if (erroredBuilds.length === 0) return base;
    if (erroredBuilds.length === 1) {
      const b = erroredBuilds[0]!;
      return `${base} · failed: ${b.label} (${b.error})`;
    }
    return `${base} · ${erroredBuilds.length} failed`;
  });

  // Helper: render a row's cell for an errored build's column. Always
  // a muted dash regardless of which row group we're in.
  function buildErroredCell(): CellValue {
    return { value: "—", variant: "muted" };
  }

  // formatDelta: signed percent of `value` vs `anchor`. Returns "" when
  // both are zero (no meaningful delta), "—" when the anchor itself is
  // zero (can't compute %), and signed integer % otherwise. Tiny deltas
  // (< 1%) carry one decimal so "+0.5%" doesn't get rounded to 0.
  function formatDelta(value: number, anchor: number): string {
    if (value === anchor) return "";
    if (anchor === 0) return "—";
    const pct = ((value - anchor) / Math.abs(anchor)) * 100;
    const sign = pct > 0 ? "+" : "";
    if (Math.abs(pct) >= 999.5) return `${sign}>999%`;
    if (Math.abs(pct) < 1) return `${sign}${pct.toFixed(1)}%`;
    return `${sign}${Math.round(pct)}%`;
  }

  let groups = $derived.by(() => {
    const out: Array<{ label: string; rows: Record<string, CellValue>[] }> = [];

    if (diffs?.summary && Object.keys(diffs.summary).length > 0) {
      out.push({
        label: "Summary",
        rows: Object.entries(diffs.summary).map(([statKey, diff]) => {
          const row: Record<string, CellValue> = { axis: formatStatKey(statKey) };
          const anchorValue = diff.perBuild[anchorIdx] ?? 0;
          successful.forEach((b, i) => {
            const value = diff.perBuild[i] ?? 0;
            const isLeader = i === diff.leader && diff.range > 0;
            const isAnchor = i === anchorIdx;
            const colKey = `b${b.id ?? b.label}`;
            const variant: Variant | undefined = isLeader ? "highlight" : undefined;
            const sublabel = isAnchor ? undefined : formatDelta(value, anchorValue) || undefined;
            // Color deltas: green for "more than anchor", red for less.
            // The "—" indicator (anchor=0) gets no color override → muted.
            let sublabelVariant: Variant | undefined;
            if (sublabel?.startsWith("+")) sublabelVariant = "positive";
            else if (sublabel?.startsWith("-")) sublabelVariant = "negative";
            // Plain number cell when there's nothing to decorate (the
            // anchor's own column on a non-leader stat).
            if (variant === undefined && sublabel === undefined) {
              row[colKey] = formatNumber(value);
            } else {
              row[colKey] = {
                value: formatNumber(value),
                variant,
                sublabel,
                sublabelVariant,
                // Deltas flow to the cell's left edge (opposite the
                // right-aligned value), mirroring the anchor column's
                // lock-on-left, label-on-right layout.
                sublabelPosition: sublabel ? "left" : undefined,
              };
            }
          });
          erroredBuilds.forEach((b) => {
            row[`b${b.id ?? b.label}`] = buildErroredCell();
          });
          return row;
        }),
      });
    }

    if (diffs?.tree) {
      const treeRows: Record<string, CellValue>[] = [
        buildTreeRow("Common to all", diffs.tree.common.length, undefined),
      ];
      successful.forEach((b) => {
        // The wire-side allocatedOnlyIn is parallel to builds[] (NOT
        // successful), so look up by the build's position in the full
        // builds list — the same b reference is filtered into successful.
        const idx = builds.indexOf(b);
        const onlyHere = idx >= 0 ? (diffs!.tree!.allocatedOnlyIn[idx] ?? []) : [];
        treeRows.push(buildTreeRow(`Only in ${buildColumnLabel(b)}`, onlyHere.length, b));
      });
      out.push({ label: "Allocated Tree", rows: treeRows });
    }

    if (diffs?.gear && Object.keys(diffs.gear).length > 0) {
      out.push({
        label: "Gear",
        rows: Object.entries(diffs.gear).map(([slot, slotDiff]) => {
          const row: Record<string, CellValue> = { axis: slot };
          successful.forEach((b, i) => {
            const item = slotDiff.perBuild[i];
            const colKey = `b${b.id ?? b.label}`;
            // modsSame:true → mechanically identical (mute even when names differ —
            // e.g. two rolls of the same rare, or a unique with relic variant).
            // Otherwise it's a real divergence — render unmuted.
            row[colKey] = item
              ? slotDiff.modsSame
                ? { value: item, variant: "muted" }
                : item
              : { value: "—", variant: "muted" };
          });
          erroredBuilds.forEach((b) => {
            row[`b${b.id ?? b.label}`] = buildErroredCell();
          });
          return row;
        }),
      });
    }

    if (diffs?.skills && diffs.skills.length > 0) {
      out.push({
        label: "Skills",
        rows: diffs.skills.map((group) => {
          const row: Record<string, CellValue> = { axis: group.label };
          successful.forEach((b, i) => {
            const gems = group.perBuild[i] ?? [];
            const colKey = `b${b.id ?? b.label}`;
            const text = gems.length > 0 ? gems.join(", ") : "—";
            row[colKey] = group.same ? { value: text, variant: "muted" } : text;
          });
          erroredBuilds.forEach((b) => {
            row[`b${b.id ?? b.label}`] = buildErroredCell();
          });
          return row;
        }),
      });
    }

    if (diffs?.config && diffs.config.length > 0) {
      out.push({
        label: "Config",
        rows: diffs.config.map((entry) => {
          const row: Record<string, CellValue> = { axis: formatStatKey(entry.key) };
          successful.forEach((b, i) => {
            const value = entry.perBuild[i];
            const colKey = `b${b.id ?? b.label}`;
            if (value === null || value === undefined) {
              row[colKey] = { value: "—", variant: "muted" };
            } else {
              row[colKey] = formatConfigValue(value);
            }
          });
          erroredBuilds.forEach((b) => {
            row[`b${b.id ?? b.label}`] = buildErroredCell();
          });
          return row;
        }),
      });
    }

    // One row group per stat that has differing modifier sources across
    // builds. Server-side has already filtered keys where every cell
    // agrees on source_name + value, so every entry here represents a
    // real divergence worth surfacing.
    if (diffs?.modSources) {
      const sortedStats = Object.keys(diffs.modSources).sort();
      for (const stat of sortedStats) {
        const entries = diffs.modSources[stat];
        if (!entries || entries.length === 0) continue;
        out.push({
          label: `Mod Sources: ${formatStatKey(stat)}`,
          rows: entries.map((entry) => {
            const row: Record<string, CellValue> = {
              axis: formatModSourceAxis(entry),
            };
            successful.forEach((b, i) => {
              const cell = entry.perBuild[i];
              const colKey = `b${b.id ?? b.label}`;
              if (cell === null || cell === undefined) {
                row[colKey] = { value: "—", variant: "muted" };
              } else {
                // Show the value with the source name as a sublabel
                // — same pattern as Summary's leader/anchor cells.
                row[colKey] = {
                  value: formatNumber(cell.value),
                  sublabel: cell.source_name,
                  sublabelPosition: "below",
                };
              }
            });
            erroredBuilds.forEach((b) => {
              row[`b${b.id ?? b.label}`] = buildErroredCell();
            });
            return row;
          }),
        });
      }
    }

    return out;
  });

  // Tree rows have a single "count" axis but the GroupedTable has one
  // column per build. When `targetBuild` is undefined the count is
  // shared (the "Common to all" row mirrors across every build column);
  // when set, only that build's column gets the count and the others
  // get a muted dash. Discriminating structurally on `targetBuild` —
  // not by string-matching the label — survives any future change to
  // buildColumnLabel formatting.
  function buildTreeRow(
    label: string,
    count: number,
    targetBuild: CompareBuild | undefined,
  ): Record<string, CellValue> {
    const row: Record<string, CellValue> = { axis: label };
    if (targetBuild === undefined) {
      successful.forEach((b) => {
        row[`b${b.id ?? b.label}`] = count;
      });
    } else {
      successful.forEach((b) => {
        const colKey = `b${b.id ?? b.label}`;
        if (b === targetBuild) {
          row[colKey] = count;
        } else {
          row[colKey] = { value: "—", variant: "muted" };
        }
      });
    }
    erroredBuilds.forEach((b) => {
      row[`b${b.id ?? b.label}`] = buildErroredCell();
    });
    return row;
  }

  // ─── Buy-similar table ──────────────────────────────────────────────
  // Rows are recommendations: "Build B has Item X; Build A doesn't —
  // here's a trade search to find it." From / For columns disambiguate
  // ordered pairs (the same item can recommend in both directions).
  // Trade column is a clickable link; the URL is generated server-side
  // and validated against the live PoE trade API.
  let buySimilarColumns = [
    { key: "slot", label: "Slot", align: "left" as const, width: "16%" },
    { key: "item", label: "Item", align: "left" as const },
    { key: "from", label: "From", align: "left" as const, width: "18%" },
    { key: "to", label: "For", align: "left" as const, width: "18%" },
    { key: "trade", label: "Trade", align: "right" as const, width: "12%" },
  ];

  let buySimilarRows = $derived.by(() => {
    if (!buySimilar) return [];
    return buySimilar.map((entry) => ({
      slot: entry.slot,
      item: entry.itemName,
      from: labelForBuildId(entry.fromBuildId),
      to: labelForBuildId(entry.toBuildId),
      trade: { value: "Search →", href: entry.tradeUrl },
    }));
  });

  // ─── Helpers ────────────────────────────────────────────────────────
  function buildColumnLabel(b: CompareBuild): string {
    if (b.character) {
      // PoB emits the literal string "None" when no ascendancy is
      // chosen — treat as absent and fall back to the base class.
      const asc = b.character.ascendancy;
      const cls = asc && asc !== "None" ? asc : b.character.class;
      return `${cls} L${b.character.level}`;
    }
    return b.label;
  }

  function labelForBuildId(id: string): string {
    const found = builds.find((b) => b.id === id);
    return found ? buildColumnLabel(found) : id.slice(0, 8);
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
    if (n >= 1_000) return n.toLocaleString();
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(1);
  }

  // Config values arrive as the raw decoded JSON type. Numbers go
  // through the same magnitude-aware formatter as Summary stats so the
  // wire shape is consistent; booleans render as Yes/No (more readable
  // than true/false in a comparison column); strings pass through.
  function formatConfigValue(value: number | boolean | string): string {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return formatNumber(value);
    return value;
  }

  // formatModSourceAxis collapses a mod-source diff entry's identity
  // into a short row label. The full key ("Item:Belly|Life|INC") is
  // dense; the axis presents source_type + mod_type which uniquely
  // identifies the kind of contribution within a stat's section.
  // Example: "Item · INC", "Tree · BASE".
  function formatModSourceAxis(entry: ModSourceDiffEntry): string {
    return `${entry.source_type} · ${entry.mod_type}`;
  }

  function formatStatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .replace(/D P S/g, "DPS")
      .replace(/E S/g, "ES")
      .replace(/E H P/g, "EHP")
      .trim();
  }
</script>

<Panel>
  <Section title="Build Comparison" {subtitle}>
    <GroupedTable {columns} {groups} />
  </Section>
</Panel>

{#if hasTreeOverlay}
  <Panel>
    <Section
      title="Allocated Tree"
      subtitle="Visual diff across builds — scroll to zoom, drag to pan, hover any node for details"
    >
      <PassiveTreeOverlay perBuildAllocated={treeAllocations} />
    </Section>
  </Panel>
{/if}

{#if hasBuySimilar}
  <Panel>
    <Section
      title="Buy Similar"
      subtitle="{buySimilar?.length} trade recommendations"
    >
      <DataTable columns={buySimilarColumns} rows={buySimilarRows} />
    </Section>
  </Panel>
{/if}
