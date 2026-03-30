import { cleanup, render, fireEvent } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./DataTable.svelte";

afterEach(cleanup);

const columns = [
  { key: "name", label: "Card Name" },
  { key: "wr", label: "GIH WR", align: "right" as const, sortable: true },
  { key: "games", label: "Games", align: "right" as const, sortable: true },
];

const rows = [
  { name: "Lightning Bolt", wr: 62.1, games: 5200 },
  { name: "Go for the Throat", wr: 58.4, games: 3100 },
  { name: "Sheoldred", wr: 65.8, games: 1800 },
];

describe("DataTable", () => {
  it("renders column headers", () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const headers = container.querySelectorAll("th");
    expect(headers).toHaveLength(3);
    expect(headers[0].textContent).toContain("Card Name");
    expect(headers[1].textContent).toContain("GIH WR");
  });

  it("renders all rows", () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const trs = container.querySelectorAll("tbody tr");
    expect(trs).toHaveLength(3);
  });

  it("renders cell values", () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const cells = container.querySelectorAll("tbody td");
    expect(cells[0].textContent).toBe("Lightning Bolt");
    expect(cells[1].textContent).toBe("62.1");
  });

  it("applies right alignment to columns", () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const headers = container.querySelectorAll("th");
    expect(headers[1].style.textAlign).toBe("right");
    const cells = container.querySelectorAll("tbody td");
    expect(cells[1].style.textAlign).toBe("right");
  });

  it("sorts by column on header click", async () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const wrHeader = container.querySelectorAll("th")[1];
    await fireEvent.click(wrHeader);

    // Should sort ascending by GIH WR
    const firstCell = container.querySelectorAll("tbody tr td")[1];
    expect(firstCell.textContent).toBe("58.4");

    // Click again for descending
    await fireEvent.click(wrHeader);
    const firstCellDesc = container.querySelectorAll("tbody tr td")[1];
    expect(firstCellDesc.textContent).toBe("65.8");
  });

  it("does not sort on non-sortable column click", async () => {
    const { container } = render(DataTable, { props: { columns, rows } });
    const nameHeader = container.querySelectorAll("th")[0];
    await fireEvent.click(nameHeader);

    // Order should be unchanged (Lightning Bolt first)
    const firstCell = container.querySelectorAll("tbody td")[0];
    expect(firstCell.textContent).toBe("Lightning Bolt");
  });

  it("applies initial sort", () => {
    const { container } = render(DataTable, {
      props: { columns, rows, sortKey: "wr", sortDir: "desc" },
    });
    const firstCell = container.querySelectorAll("tbody td")[0];
    expect(firstCell.textContent).toBe("Sheoldred");
  });

  it("shows sort indicator on active column", async () => {
    const { container } = render(DataTable, {
      props: { columns, rows, sortKey: "wr", sortDir: "asc" },
    });
    const wrHeader = container.querySelectorAll("th")[1];
    expect(wrHeader.querySelector(".sort-indicator")).toBeTruthy();
  });

  it("handles empty rows", () => {
    const { container } = render(DataTable, { props: { columns, rows: [] } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });

  it("renders cell variant colors", () => {
    const variantRows = [
      { name: "Plasteel", wr: { value: 1.2, variant: "positive" as const }, games: 500 },
    ];
    const { container } = render(DataTable, { props: { columns, rows: variantRows } });
    const cells = container.querySelectorAll("tbody td");
    expect(cells[1].textContent).toBe("1.2");
    expect(cells[1].classList.contains("positive")).toBe(true);
    expect(cells[1].classList.contains("has-variant")).toBe(true);
  });

  it("sorts by raw value when cells have variant objects", async () => {
    const variantRows = [
      { name: "A", wr: { value: 30, variant: "negative" as const }, games: 1 },
      { name: "B", wr: { value: 90, variant: "positive" as const }, games: 2 },
      { name: "C", wr: { value: 60 }, games: 3 },
    ];
    const { container } = render(DataTable, {
      props: { columns, rows: variantRows, sortKey: "wr", sortDir: "asc" },
    });
    const firstCell = container.querySelectorAll("tbody td")[0];
    expect(firstCell.textContent).toBe("A");
  });

  it("sorts by sortValue when present instead of display value", () => {
    const chanceRows = [
      { name: "Mephisto", chance: { value: "1:925", sortValue: 1 / 925 } },
      { name: "Baal NM", chance: { value: "1:710", sortValue: 1 / 710 } },
      { name: "Nihlathak", chance: { value: "1:7312", sortValue: 1 / 7312 } },
    ];
    const chanceColumns = [
      { key: "name", label: "Monster" },
      { key: "chance", label: "Chance", align: "right" as const, sortable: true },
    ];
    // Descending by sortValue: Baal NM (1/710) > Mephisto (1/925) > Nihlathak (1/7312)
    const { container } = render(DataTable, {
      props: { columns: chanceColumns, rows: chanceRows, sortKey: "chance", sortDir: "desc" },
    });
    const names = container.querySelectorAll("tbody td:first-child");
    expect(names[0].textContent).toBe("Baal NM");
    expect(names[1].textContent).toBe("Mephisto");
    expect(names[2].textContent).toBe("Nihlathak");
    // Display should still show the formatted string
    const chances = container.querySelectorAll("tbody td:nth-child(2)");
    expect(chances[0].textContent).toBe("1:710");
  });

  it("applies column format function", () => {
    const fmtColumns = [
      { key: "name", label: "Name" },
      { key: "val", label: "Value", format: (v: string | number | { value: string | number }) => {
        const raw = typeof v === "object" && v !== null && "value" in v ? v.value : v;
        return `${raw}%`;
      }},
    ];
    const fmtRows = [{ name: "Test", val: 85.3 }];
    const { container } = render(DataTable, { props: { columns: fmtColumns, rows: fmtRows } });
    const cells = container.querySelectorAll("tbody td");
    expect(cells[1].textContent).toBe("85.3%");
  });
});
