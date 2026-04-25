<!--
  @component
  Tabular data with one header row and multiple row groups separated
  by category bars. Like DataTable but with named row sections —
  useful when comparing N items across categorically-different axes
  (stats / gear / skills / etc.) without redeclaring the column headers
  for each category.

  Shape mirrors DataTable's columns/rows API; group structure adds an
  outer layer.
-->
<script lang="ts">
  type Variant = "positive" | "negative" | "highlight" | "info" | "warning" | "muted"
    | "legendary" | "epic" | "rare" | "uncommon" | "common" | "poor";

  /** A cell value can be a plain string/number or a rich object with variant coloring. */
  type CellValue = string | number | { value: string | number; variant?: Variant };

  interface Column {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    width?: string;
    /** Applies to the header and every cell in this column. Cell-level
        variants on individual values still take precedence. */
    variant?: Variant;
    /** Smaller secondary line below the main label — useful for column
        states like "errored" or "incomplete". */
    sublabel?: string;
  }

  interface RowGroup {
    /** Category label shown above this group's rows. */
    label: string;
    /** Optional accent for the category label (default: --color-gold). */
    accent?: string;
    /** Rows in this group; same shape as DataTable rows. */
    rows: Record<string, CellValue>[];
  }

  interface Props {
    columns: Column[];
    groups: RowGroup[];
  }

  let { columns, groups }: Props = $props();

  function rawValue(cell: CellValue): string | number {
    if (typeof cell === "object" && cell !== null && "value" in cell) return cell.value;
    return cell;
  }

  function cellVariant(cell: CellValue): Variant | undefined {
    if (typeof cell === "object" && cell !== null && "variant" in cell) return cell.variant;
    return undefined;
  }
</script>

<div class="table-wrapper">
  <table class="grouped-table">
    <colgroup>
      {#each columns as col}
        <col class={col.variant ?? ""} style:width={col.width} />
      {/each}
    </colgroup>
    <thead>
      <tr>
        {#each columns as col}
          <th
            style:text-align={col.align ?? "left"}
            class={col.variant ?? ""}
          >
            {col.label}
            {#if col.sublabel}
              <span class="sublabel">{col.sublabel}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    {#each groups as group}
      <tbody class="group">
        <tr class="group-header" style:--group-accent={group.accent ?? undefined}>
          <td colspan={columns.length}>
            <span class="group-label">{group.label}</span>
            <span class="group-line"></span>
          </td>
        </tr>
        {#each group.rows as row}
          <tr>
            {#each columns as col}
              {@const cell = row[col.key] as CellValue}
              {@const variant = cellVariant(cell) ?? col.variant}
              <td
                style:text-align={col.align ?? "left"}
                class:has-variant={!!variant}
                class={variant ?? ""}
              >
                {rawValue(cell)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    {/each}
  </table>
</div>

<style>
  .table-wrapper {
    overflow-x: auto;
  }

  .grouped-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-body);
    font-size: 15px;
  }

  thead th {
    font-family: var(--font-pixel);
    font-size: 9px;
    font-weight: 400;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: var(--space-sm) var(--space-sm);
    border-bottom: 2px solid var(--color-border);
    white-space: nowrap;
    user-select: none;
    text-align: left;
  }

  thead th .sublabel {
    display: block;
    font-size: 8px;
    font-weight: 400;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
    margin-top: 2px;
    opacity: 0.8;
  }

  /* Category-bar row spans all columns; gold-tinted trailing gradient
     line gives the bar visual weight. Vertical column separators stop
     at each bar by design — the bar IS the section divider. */
  .group-header {
    --group-accent: var(--color-gold);
  }

  .group-header td {
    padding: var(--space-lg) var(--space-sm) var(--space-sm);
    border-bottom: 2px solid color-mix(in srgb, var(--group-accent) 50%, transparent);
  }

  .group-header td > .group-label {
    font-family: var(--font-pixel);
    font-size: 10px;
    font-weight: 400;
    color: color-mix(in srgb, var(--group-accent) 90%, var(--color-text-muted));
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-right: var(--space-sm);
  }

  .group-header td > .group-line {
    display: inline-block;
    width: 100%;
    max-width: calc(100% - 12rem);
    height: 1px;
    vertical-align: middle;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--group-accent) 35%, transparent) 0%,
      color-mix(in srgb, var(--group-accent) 12%, transparent) 70%,
      transparent 100%
    );
  }

  /* Data rows — same styling as DataTable for visual consistency. */
  tbody td:not(.group-header td) {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text);
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  tbody.group tr:not(.group-header):nth-child(even) td {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  tbody.group tr:not(.group-header):hover td {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  /* Vertical separators between build columns — only inside data rows.
     Category bars are full-width by design. */
  thead th:not(:first-child),
  tbody.group tr:not(.group-header) td:not(:first-child) {
    border-left: 1px solid color-mix(in srgb, var(--color-border) 35%, transparent);
  }

  /* Variant colors apply to both header (th) and cells (td) so a
     column-level variant tints the whole column. Same set as DataTable. */
  th.positive, td.positive { color: var(--color-positive); }
  th.negative, td.negative { color: var(--color-negative); }
  th.highlight, td.highlight { color: var(--color-highlight); }
  th.info, td.info { color: var(--color-info); }
  th.warning, td.warning { color: var(--color-warning); }
  th.muted, td.muted { color: var(--color-text-muted); }
  th.legendary, td.legendary { color: var(--color-rarity-legendary); }
  th.epic, td.epic { color: var(--color-rarity-epic); }
  th.rare, td.rare { color: var(--color-rarity-rare); }
  th.uncommon, td.uncommon { color: var(--color-rarity-uncommon); }
  th.common, td.common { color: var(--color-rarity-common); }
  th.poor, td.poor { color: var(--color-rarity-poor); }

  /* Column-level variants get a subtle background tint via <col>.
     The tint paints behind every cell in the column, including
     category-bar cells, giving the whole vertical stripe a tinted
     hue that reinforces the column's state. */
  col.negative { background-color: color-mix(in srgb, var(--color-negative) 10%, transparent); }
  col.warning { background-color: color-mix(in srgb, var(--color-warning) 10%, transparent); }
  col.info { background-color: color-mix(in srgb, var(--color-info) 10%, transparent); }
  col.positive { background-color: color-mix(in srgb, var(--color-positive) 10%, transparent); }

  td.has-variant {
    font-weight: 700;
  }
</style>
