import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import OracleText from "./OracleText.svelte";

afterEach(cleanup);

describe("OracleText", () => {
  it("renders plain text", () => {
    const { container } = render(OracleText, { props: { text: "Deal 3 damage." } });
    expect(container.textContent).toContain("Deal 3 damage.");
  });

  it("splits abilities on newlines into separate blocks", () => {
    const { container } = render(OracleText, {
      props: { text: "Deathtouch\nWhenever you draw a card, you gain 2 life." },
    });
    const abilities = container.querySelectorAll(".ability");
    expect(abilities.length).toBe(2);
  });

  it("renders mana symbols as pips", () => {
    const { container } = render(OracleText, {
      props: { text: "Add {R}{G}{W}{U}." },
    });
    const pips = container.querySelectorAll(".pip");
    expect(pips.length).toBe(4);
  });

  it("renders mixed text and mana symbols", () => {
    const { container } = render(OracleText, {
      props: { text: "Pay {2}{B}: Draw a card." },
    });
    const pips = container.querySelectorAll(".pip");
    expect(pips.length).toBe(2);
    expect(container.textContent).toContain("Pay");
    expect(container.textContent).toContain(": Draw a card.");
  });

  it("renders three abilities with separators between them", () => {
    const { container } = render(OracleText, {
      props: { text: "First strike\nLifelink\nWhenever this creature attacks, draw a card." },
    });
    const abilities = container.querySelectorAll(".ability");
    expect(abilities.length).toBe(3);
    const separators = container.querySelectorAll(".ability-separator");
    expect(separators.length).toBe(2);
  });

  it("handles empty text", () => {
    const { container } = render(OracleText, { props: { text: "" } });
    expect(container.querySelectorAll(".ability").length).toBe(0);
  });

  it("handles text with no mana symbols", () => {
    const { container } = render(OracleText, {
      props: { text: "Destroy target creature." },
    });
    expect(container.querySelectorAll(".pip").length).toBe(0);
    expect(container.textContent).toContain("Destroy target creature.");
  });
});
