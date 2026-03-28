import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import Timeline from "./Timeline.svelte";

afterEach(cleanup);

const events = [
  { label: "Lightning Bolt", sublabel: "Pack 1, Pick 1", value: "A+", variant: "positive" },
  { label: "Go for the Throat", sublabel: "Pack 1, Pick 2", value: "B+", variant: "info" },
  { label: "Swamp", sublabel: "Pack 1, Pick 3", value: "—" },
];

describe("Timeline", () => {
  it("renders all events", () => {
    const { container } = render(Timeline, { props: { events } });
    const items = container.querySelectorAll(".timeline-event");
    expect(items).toHaveLength(3);
  });

  it("renders event labels", () => {
    const { container } = render(Timeline, { props: { events } });
    const labels = container.querySelectorAll(".event-label");
    expect(labels[0].textContent).toBe("Lightning Bolt");
  });

  it("renders sublabels when provided", () => {
    const { container } = render(Timeline, { props: { events } });
    const sublabels = container.querySelectorAll(".event-sublabel");
    expect(sublabels).toHaveLength(3);
    expect(sublabels[0].textContent).toBe("Pack 1, Pick 1");
  });

  it("renders values", () => {
    const { container } = render(Timeline, { props: { events } });
    const values = container.querySelectorAll(".event-value");
    expect(values[0].textContent).toBe("A+");
  });

  it("renders timeline dots", () => {
    const { container } = render(Timeline, { props: { events } });
    const dots = container.querySelectorAll(".dot");
    expect(dots).toHaveLength(3);
  });

  it("renders connecting line", () => {
    const { container } = render(Timeline, { props: { events } });
    expect(container.querySelector(".timeline-line")).toBeTruthy();
  });

  it("handles empty events", () => {
    const { container } = render(Timeline, { props: { events: [] } });
    expect(container.querySelectorAll(".timeline-event")).toHaveLength(0);
  });
});
