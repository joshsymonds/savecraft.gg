import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import GroupedTable from "./GroupedTable.svelte";

afterEach(cleanup);

describe("GroupedTable", () => {
  const columns = [
    { key: "axis", label: "Stat" },
    { key: "a", label: "A" },
    { key: "b", label: "B" },
  ];

  it("renders one header row across all columns", () => {
    const { container } = render(GroupedTable, {
      columns,
      groups: [{ label: "G1", rows: [{ axis: "x", a: "1", b: "2" }] }],
    });
    const headerCells = container.querySelectorAll("thead th");
    expect(headerCells).toHaveLength(3);
    expect(headerCells[0]?.textContent?.trim()).toBe("Stat");
    expect(headerCells[1]?.textContent?.trim()).toBe("A");
    expect(headerCells[2]?.textContent?.trim()).toBe("B");
  });

  it("renders a category-bar row per group spanning all columns", () => {
    const { container } = render(GroupedTable, {
      columns,
      groups: [
        { label: "Summary", rows: [{ axis: "DPS", a: "1.2M", b: "2.5M" }] },
        { label: "Gear", rows: [{ axis: "Helmet", a: "Foible", b: "Devoto" }] },
      ],
    });
    const groupHeaders = container.querySelectorAll(".group-header");
    expect(groupHeaders).toHaveLength(2);
    const labels = container.querySelectorAll(".group-label");
    expect(labels[0]?.textContent).toBe("Summary");
    expect(labels[1]?.textContent).toBe("Gear");

    // Each category bar spans the full column count via a single
    // colspan'd cell. Vertical column separators stop at each bar by
    // design — the bar itself IS the section divider.
    const colspan = groupHeaders[0]?.querySelector("td")?.getAttribute("colspan");
    expect(colspan).toBe("3");
  });

  it("renders data rows under each group", () => {
    const { container } = render(GroupedTable, {
      columns,
      groups: [
        {
          label: "G1",
          rows: [
            { axis: "x", a: "1", b: "2" },
            { axis: "y", a: "3", b: "4" },
          ],
        },
      ],
    });
    // 2 data rows + 1 group header row.
    const tbody = container.querySelector("tbody");
    const dataRows = tbody?.querySelectorAll("tr:not(.group-header)");
    expect(dataRows).toHaveLength(2);
    expect(dataRows?.[0]?.textContent).toContain("x");
    expect(dataRows?.[1]?.textContent).toContain("y");
  });

  it("applies cell variant styling when provided", () => {
    const { container } = render(GroupedTable, {
      columns,
      groups: [
        {
          label: "G1",
          rows: [{ axis: "x", a: { value: "win", variant: "highlight" }, b: "lose" }],
        },
      ],
    });
    const highlightCell = container.querySelector("td.highlight");
    expect(highlightCell?.textContent).toBe("win");
  });

  it("applies column-level variant to header and all cells in that column", () => {
    const { container } = render(GroupedTable, {
      columns: [
        { key: "axis", label: "Stat" },
        { key: "a", label: "A" },
        { key: "b", label: "B", variant: "warning", sublabel: "errored" },
      ],
      groups: [
        {
          label: "G1",
          rows: [
            { axis: "x", a: "1", b: "—" },
            { axis: "y", a: "3", b: "—" },
          ],
        },
      ],
    });
    // Header gets the variant class and the sublabel span.
    const headers = container.querySelectorAll("thead th");
    expect(headers[2]?.classList.contains("warning")).toBe(true);
    expect(headers[2]?.querySelector(".sublabel")?.textContent).toBe("errored");
    // All cells in column "b" inherit the warning variant.
    const tbody = container.querySelector("tbody");
    const dataRows = tbody?.querySelectorAll("tr:not(.group-header)") ?? [];
    expect(dataRows[0]?.querySelectorAll("td")[2]?.classList.contains("warning")).toBe(true);
    expect(dataRows[1]?.querySelectorAll("td")[2]?.classList.contains("warning")).toBe(true);
    // Cells in other columns are not affected.
    expect(dataRows[0]?.querySelectorAll("td")[1]?.classList.contains("warning")).toBe(false);
  });

  it("cell-level variant overrides column-level variant", () => {
    const { container } = render(GroupedTable, {
      columns: [
        { key: "axis", label: "Stat" },
        { key: "b", label: "B", variant: "warning" },
      ],
      groups: [
        {
          label: "G1",
          rows: [{ axis: "x", b: { value: "win", variant: "highlight" } }],
        },
      ],
    });
    const cell = container.querySelector("tbody tr:not(.group-header) td.highlight");
    expect(cell?.textContent).toBe("win");
    // Should NOT also have the warning class.
    expect(cell?.classList.contains("warning")).toBe(false);
  });

  it("renders multiple groups without bleeding rows across them", () => {
    const { container } = render(GroupedTable, {
      columns,
      groups: [
        { label: "G1", rows: [{ axis: "g1-row", a: "a", b: "b" }] },
        { label: "G2", rows: [{ axis: "g2-row", a: "a", b: "b" }] },
      ],
    });
    const tbodies = container.querySelectorAll("tbody.group");
    expect(tbodies).toHaveLength(2);
    expect(tbodies[0]?.textContent).toContain("g1-row");
    expect(tbodies[0]?.textContent).not.toContain("g2-row");
    expect(tbodies[1]?.textContent).toContain("g2-row");
  });
});
