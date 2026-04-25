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

  interface CompareBuild {
    id?: string;
    label: string;
    character?: { class: string; ascendancy?: string; level: number };
    summary?: Record<string, number>;
    error?: string;
  }

  interface StatDiff {
    perBuild: number[];
    leader: number;
    range: number;
  }

  interface TreeDiff {
    allocatedOnlyIn: Record<string, number[]>;
    common: number[];
  }

  interface SlotDiff {
    perBuild: Array<string | null>;
    same: boolean;
  }

  interface SocketGroupDiff {
    label: string;
    perBuild: string[][];
    same: boolean;
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

  // The successful subset is what diff.perBuild arrays are indexed
  // against. Errored builds appear in `builds` AND get their own column
  // (in errored state with muted "—" cells), so the user can see which
  // builds failed without losing the diff against the rest.
  let successful = $derived(builds.filter((b) => !b.error));

  type Variant = "highlight" | "muted" | "negative";
  type CellValue = string | number | { value: string | number; variant?: Variant };

  // One column per build (successful AND errored), preserving the
  // original `builds` order. Errored columns use variant: "warning"
  // and a "errored" sublabel so the column reads as failed start to
  // finish; their cells get muted dashes from buildErroredCell below.
  let columns = $derived([
    { key: "axis", label: "", align: "left" as const, width: "30%" },
    ...builds.map((b) => ({
      key: `b${b.id ?? b.label}`,
      label: buildColumnLabel(b),
      align: "right" as const,
      variant: b.error ? ("negative" as const) : undefined,
      sublabel: b.error ? "errored" : undefined,
    })),
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

  let groups = $derived.by(() => {
    const out: Array<{ label: string; rows: Record<string, CellValue>[] }> = [];

    if (diffs?.summary && Object.keys(diffs.summary).length > 0) {
      out.push({
        label: "Summary",
        rows: Object.entries(diffs.summary).map(([statKey, diff]) => {
          const row: Record<string, CellValue> = { axis: formatStatKey(statKey) };
          successful.forEach((b, i) => {
            const value = diff.perBuild[i] ?? 0;
            const isLeader = i === diff.leader && diff.range > 0;
            const colKey = `b${b.id ?? b.label}`;
            row[colKey] = isLeader
              ? { value: formatNumber(value), variant: "highlight" }
              : formatNumber(value);
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
        const onlyHere = diffs!.tree!.allocatedOnlyIn[b.id ?? ""] ?? [];
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
            row[colKey] = item
              ? slotDiff.same
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
      const cls = b.character.ascendancy || b.character.class;
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
