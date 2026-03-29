import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Crops from "../../../../plugins/rimworld/reference/views/crops.svelte";

afterEach(cleanup);

const riceData = {
  crop: "rice plant",
  growth_rate: 1.0,
  actual_grow_days: 5.14,
  nutrition_per_day: 0.058,
  silver_per_day: 1.284,
  tiles_needed: 12,
  hydroponics: true,
};

describe("Crops view", () => {
  it("renders the crop name", () => {
    const { container } = render(Crops, { props: { data: riceData } });
    expect(container.textContent).toContain("rice plant");
  });

  it("renders tiles needed as hero stat", () => {
    const { container } = render(Crops, { props: { data: riceData } });
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("Tiles per colonist");
  });

  it("renders days to harvest", () => {
    const { container } = render(Crops, { props: { data: riceData } });
    expect(container.textContent).toContain("5.1");
  });

  it("shows hydroponics badge when eligible", () => {
    const { container } = render(Crops, { props: { data: riceData } });
    expect(container.textContent).toContain("HYDROPONICS");
  });

  it("hides hydroponics badge when not eligible", () => {
    const noHydro = { ...riceData, hydroponics: false };
    const { container } = render(Crops, { props: { data: noHydro } });
    expect(container.textContent).not.toContain("HYDROPONICS");
  });
});
