<!--
  @component
  Sortable data table with typed columns and optional cell formatting.
  Used for card stats, drop tables, match history, crop comparisons, material grids.
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
    sortable?: boolean;
    width?: string;
    /** Format the raw cell value for display */
    format?: (value: CellValue) => string;
  }

  interface Props {
    /** Column definitions */
    columns: Column[];
    /** Row data — each row is a Record keyed by column.key. Values can be plain or { value, variant }. */
    rows: Record<string, CellValue>[];
    /** Initial sort column key */
    sortKey?: string;
    /** Initial sort direction */
    sortDir?: "asc" | "desc";
  }

  let { columns, rows, sortKey, sortDir = "asc" }: Props = $props();

  /** Extract the raw sortable/displayable value from a CellValue. */
  function rawValue(cell: CellValue): string | number {
    if (typeof cell === "object" && cell !== null && "value" in cell) return cell.value;
    return cell;
  }

  /** Extract the variant from a CellValue, if any. */
  function cellVariant(cell: CellValue): Variant | undefined {
    if (typeof cell === "object" && cell !== null && "variant" in cell) return cell.variant;
    return undefined;
  }

  // eslint-disable-next-line -- initial values from props, intentionally captured once
  let activeSortKey = $state(sortKey); // svelte-ignore state_referenced_locally
  let activeSortDir = $state<"asc" | "desc">(sortDir); // svelte-ignore state_referenced_locally

  function handleSort(col: Column) {
    if (!col.sortable) return;
    if (activeSortKey === col.key) {
      activeSortDir = activeSortDir === "asc" ? "desc" : "asc";
    } else {
      activeSortKey = col.key;
      activeSortDir = "asc";
    }
  }

  let sortedRows = $derived.by(() => {
    if (!activeSortKey) return rows;
    const key = activeSortKey;
    const dir = activeSortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = rawValue(a[key] as CellValue);
      const vb = rawValue(b[key] as CellValue);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  });
</script>

<div class="table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        {#each columns as col}
          <th
            class:sortable={col.sortable}
            class:active={activeSortKey === col.key}
            style:text-align={col.align ?? "left"}
            style:width={col.width}
            onclick={() => handleSort(col)}
          >
            {col.label}
            {#if activeSortKey === col.key}
              <span class="sort-indicator">{activeSortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sortedRows as row}
        <tr>
          {#each columns as col}
            {@const cell = row[col.key] as CellValue}
            {@const variant = cellVariant(cell)}
            <td style:text-align={col.align ?? "left"} class:has-variant={!!variant} class={variant ?? ""}>
              {col.format ? col.format(cell) : rawValue(cell)}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrapper {
    overflow-x: auto;
  }

  .data-table {
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
  }

  thead th.sortable {
    cursor: pointer;
    transition: color 0.15s;
  }

  thead th.sortable:hover {
    color: var(--color-text);
  }

  thead th.active {
    color: var(--color-gold);
  }

  .sort-indicator {
    font-size: 8px;
    margin-left: 4px;
    vertical-align: middle;
  }

  tbody td {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text);
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 30%, transparent);
  }

  tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--color-border) 8%, transparent);
  }

  tbody tr:hover td {
    background: color-mix(in srgb, var(--color-border) 14%, transparent);
  }

  /* Cell variant colors */
  td.positive { color: var(--color-positive); }
  td.negative { color: var(--color-negative); }
  td.highlight { color: var(--color-highlight); }
  td.info { color: var(--color-info); }
  td.warning { color: var(--color-warning); }
  td.muted { color: var(--color-text-muted); }
  td.legendary { color: var(--color-rarity-legendary); }
  td.epic { color: var(--color-rarity-epic); }
  td.rare { color: var(--color-rarity-rare); }
  td.uncommon { color: var(--color-rarity-uncommon); }
  td.common { color: var(--color-rarity-common); }
  td.poor { color: var(--color-rarity-poor); }

  td.has-variant {
    font-weight: 700;
  }
</style>
