import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Heatmap from "./Heatmap.svelte";

afterEach(cleanup);

const rows = [
  { label: "Boros", cells: [{ value: 55 }, { value: 62 }, { value: 48 }] },
  { label: "Dimir", cells: [{ value: 58 }, { value: 51 }, { value: 64 }] },
];
const columnLabels = ["FDN", "DSK", "BLB"];

describe("Heatmap", () => {
  it("renders a table", () => {
    const { container } = render(Heatmap, { props: { rows, columnLabels } });
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("renders column headers", () => {
    const { container } = render(Heatmap, { props: { rows, columnLabels } });
    const ths = container.querySelectorAll("thead th");
    // First th is empty (row label column), then 3 column headers
    expect(ths).toHaveLength(4);
    expect(ths[1].textContent).toBe("FDN");
  });

  it("renders row labels", () => {
    const { container } = render(Heatmap, { props: { rows, columnLabels } });
    const rowHeaders = container.querySelectorAll("tbody th");
    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0].textContent).toBe("Boros");
  });

  it("renders all cells", () => {
    const { container } = render(Heatmap, { props: { rows, columnLabels } });
    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(6);
  });

  it("renders cell values", () => {
    const { container } = render(Heatmap, { props: { rows, columnLabels } });
    const cells = container.querySelectorAll("tbody td");
    expect(cells[0].textContent).toContain("55");
  });

  it("renders cell labels when provided", () => {
    const labeledRows = [
      { label: "Row", cells: [{ value: 55, label: "55.2%" }] },
    ];
    const { container } = render(Heatmap, { props: { rows: labeledRows, columnLabels: ["Col"] } });
    expect(container.querySelector("tbody td")!.textContent).toContain("55.2%");
  });
});
