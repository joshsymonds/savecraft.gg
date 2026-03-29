import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Surgery from "../../../../plugins/rimworld/reference/views/surgery.svelte";

afterEach(cleanup);

const baseData = {
  success_chance: 0.853,
  surgeon_factor: 0.9,
  bed_factor: 1.1,
  medicine_factor: 1.0,
  difficulty: 1.0,
  inspired: false,
  capped: false,
  uncapped: 0.853,
};

describe("Surgery view", () => {
  it("renders the success percentage", () => {
    const { container } = render(Surgery, { props: { data: baseData } });
    // ProgressRing renders the label
    const ring = container.querySelector(".progress-ring");
    expect(ring).toBeTruthy();
  });

  it("renders the factor chain", () => {
    const { container } = render(Surgery, { props: { data: baseData } });
    const factors = container.querySelectorAll(".factor-item:not(.factor-result)");
    expect(factors.length).toBeGreaterThanOrEqual(4);
  });

  it("shows capped badge when at 98%", () => {
    const cappedData = { ...baseData, success_chance: 0.98, capped: true, uncapped: 1.05 };
    const { container } = render(Surgery, { props: { data: cappedData } });
    const badge = container.querySelector(".badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain("CAPPED");
  });

  it("shows inspired badge when inspired", () => {
    const inspiredData = { ...baseData, inspired: true };
    const { container } = render(Surgery, { props: { data: inspiredData } });
    const text = container.textContent;
    expect(text).toContain("Inspired");
  });
});
