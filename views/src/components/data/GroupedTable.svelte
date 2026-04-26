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

  /** A cell value can be a plain string/number or a rich object with optional
      variant coloring and an optional small sublabel rendered next to the
      value (e.g. a delta or unit annotation). The sublabel can carry its own
      variant — e.g. positive (green) / negative (red) for deltas — so the
      annotation's color is independent of the parent value's color.

      sublabelPosition: "below" (default) places the sublabel under the value
      as a small block. "left" places it inline on the opposite side from the
      cell's text-align — useful for delta annotations that should flow into
      the column's gutter rather than stack vertically. */
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
    /** Optional variant for the sublabel only (e.g. highlight to
        emphasise an "anchor" tag without coloring the column's data). */
    sublabelVariant?: Variant;
    /** When true, render a lock-icon prefix at the left of the column
        header — used to mark the "anchor" column in pin/anchor models.
        Pairs naturally with variant=highlight for the gold-tinted
        column-wide background. */
    pinned?: boolean;
    /** When set, the column header becomes clickable (cursor:pointer,
        keyboard-accessible). Used to let consumers swap the pinned
        column. Pinned columns are typically left without an onSelect
        handler since clicking your own pin is a no-op. */
    onSelect?: () => void;
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

  function cellSublabel(cell: CellValue): string | undefined {
    if (typeof cell === "object" && cell !== null && "sublabel" in cell) return cell.sublabel;
    return undefined;
  }

  function cellSublabelVariant(cell: CellValue): Variant | undefined {
    if (typeof cell === "object" && cell !== null && "sublabelVariant" in cell)
      return cell.sublabelVariant;
    return undefined;
  }

  function cellSublabelPosition(cell: CellValue): "below" | "left" {
    if (typeof cell === "object" && cell !== null && "sublabelPosition" in cell)
      return cell.sublabelPosition ?? "below";
    return "below";
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
            class:pinned={col.pinned}
            class:clickable={!!col.onSelect}
            class={col.variant ?? ""}
            onclick={col.onSelect}
            onkeydown={col.onSelect ? (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); col.onSelect?.(); }
            } : undefined}
            tabindex={col.onSelect ? 0 : undefined}
            role={col.onSelect ? "button" : undefined}
          >
            {#if col.pinned}
              <span class="pin-icon" aria-hidden="true">🔒</span>
            {/if}
            <span class="th-label">
              {col.label}
              {#if col.sublabel}
                <span class="sublabel {col.sublabelVariant ?? ''}">{col.sublabel}</span>
              {/if}
            </span>
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
              {@const sublabel = cellSublabel(cell)}
              {@const sublabelVariant = cellSublabelVariant(cell)}
              {@const sublabelPosition = cellSublabelPosition(cell)}
              {@const inlineSublabel = sublabel && sublabelPosition === "left"}
              <td
                style:text-align={col.align ?? "left"}
                class:has-variant={!!variant}
                class:flex-cell={inlineSublabel}
                class={variant ?? ""}
              >
                {#if inlineSublabel}
                  <span class="cell-sublabel inline {sublabelVariant ?? ''}">{sublabel}</span>
                {/if}
                <span class="cell-value">{rawValue(cell)}</span>
                {#if sublabel && !inlineSublabel}
                  <span class="cell-sublabel {sublabelVariant ?? ''}">{sublabel}</span>
                {/if}
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

  /* Pinned (anchor) column header: lock icon at the LEFT, label group
     at the right (matching the column's text-align). Two-row label
     stays inside the right span so the lock alone fills the left side. */
  thead th.pinned {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  thead th.pinned .pin-icon {
    font-size: 12px;
    line-height: 1;
    flex-shrink: 0;
  }

  thead th.pinned .th-label {
    text-align: right;
    flex: 1;
  }

  /* Clickable column headers (used for "make this build the anchor"
     re-pin behaviour). Cursor + keyboard focus ring; hover slightly
     brightens the label. */
  thead th.clickable {
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
  }

  thead th.clickable:hover {
    color: var(--color-text);
    background: color-mix(in srgb, var(--color-border) 18%, transparent);
  }

  thead th.clickable:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
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

  /* Column-header sublabel variants — used for "anchor" tags and
     similar column-state callouts. Bumped weight + opacity so a
     highlight-variant tag actually pops from the muted defaults. */
  thead th .sublabel.positive { color: var(--color-positive); opacity: 1; font-weight: 700; }
  thead th .sublabel.negative { color: var(--color-negative); opacity: 1; font-weight: 700; }
  thead th .sublabel.highlight { color: var(--color-highlight); opacity: 1; font-weight: 700; }
  thead th .sublabel.info { color: var(--color-info); opacity: 1; font-weight: 700; }
  thead th .sublabel.warning { color: var(--color-warning); opacity: 1; font-weight: 700; }

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
     hue that reinforces the column's state. Highlight is bumped a
     bit higher than the others — used for "anchor" callouts that
     should clearly stand apart from neutral build columns. */
  col.negative { background-color: color-mix(in srgb, var(--color-negative) 10%, transparent); }
  col.warning { background-color: color-mix(in srgb, var(--color-warning) 10%, transparent); }
  col.info { background-color: color-mix(in srgb, var(--color-info) 10%, transparent); }
  col.positive { background-color: color-mix(in srgb, var(--color-positive) 10%, transparent); }
  col.highlight { background-color: color-mix(in srgb, var(--color-gold) 14%, transparent); }

  td.has-variant {
    font-weight: 700;
  }

  /* Cells with an inline (left-positioned) sublabel keep the
     delta-and-value as a tight right-aligned pair — pulling the
     delta to the cell's far edge would have it sitting next to the
     adjacent column's value and read as that column's annotation. */
  td.flex-cell {
    text-align: right;
  }
  td.flex-cell .cell-sublabel.inline {
    margin-right: var(--space-xs);
  }

  /* Per-cell sublabel: small line under the value (or beside it when
     inline), used for deltas / units / context annotations. Defaults
     to muted; sublabelVariant lets cells carry positive/negative/
     highlight coloring (e.g. green/red deltas) independent of the
     parent value's color. */
  .cell-sublabel {
    display: block;
    font-family: var(--font-pixel);
    font-size: 8px;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 1px;
    margin-top: 3px;
  }

  /* Inline (left-positioned) sublabel — sits beside the value, no
     stacking gap. Slightly smaller weight so the value reads as the
     primary content. */
  .cell-sublabel.inline {
    display: inline;
    margin-top: 0;
    font-size: 9px;
  }

  /* Sublabel variant colors override the default muted. */
  .cell-sublabel.positive { color: var(--color-positive); }
  .cell-sublabel.negative { color: var(--color-negative); }
  .cell-sublabel.highlight { color: var(--color-highlight); }
  .cell-sublabel.info { color: var(--color-info); }
  .cell-sublabel.warning { color: var(--color-warning); }
</style>
