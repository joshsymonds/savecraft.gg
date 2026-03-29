import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import MtgCard from "./MtgCard.svelte";

afterEach(cleanup);

const bolt = {
  name: "Lightning Bolt",
  manaCost: "{R}",
  typeLine: "Instant",
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  colors: ["R"],
  colorIdentity: ["R"],
  rarity: "common",
};

const sheoldred = {
  name: "Sheoldred, the Apocalypse",
  manaCost: "{2}{B}{B}",
  typeLine: "Legendary Creature — Phyrexian Praetor",
  oracleText: "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
  colors: ["B"],
  colorIdentity: ["B"],
  rarity: "mythic",
  keywords: ["Deathtouch"],
};

const forest = {
  name: "Forest",
  manaCost: "",
  typeLine: "Basic Land — Forest",
  colors: [],
  colorIdentity: ["G"],
  rarity: "common",
};

describe("MtgCard", () => {
  it("renders the card name", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.textContent).toContain("Lightning Bolt");
  });

  it("renders mana cost pips", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    const pips = container.querySelectorAll(".pip");
    expect(pips.length).toBeGreaterThan(0);
  });

  it("renders type line", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.textContent).toContain("Instant");
  });

  it("renders oracle text when present", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.textContent).toContain("deals 3 damage");
  });

  it("omits oracle text section when absent", () => {
    const { container } = render(MtgCard, { props: { card: forest } });
    expect(container.querySelector(".oracle-text")).toBeNull();
  });

  it("renders rarity badge", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    const badge = container.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("common");
  });

  it("renders color bar", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.querySelector(".color-bar")).not.toBeNull();
  });

  it("applies mythic glow class for mythic rarity", () => {
    const { container } = render(MtgCard, { props: { card: sheoldred } });
    expect(container.querySelector(".mythic")).not.toBeNull();
  });

  it("does not apply mythic class for common rarity", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.querySelector(".mythic")).toBeNull();
  });

  it("renders no mana cost pips for lands", () => {
    const { container } = render(MtgCard, { props: { card: forest } });
    const pips = container.querySelectorAll(".pip");
    expect(pips.length).toBe(0);
  });

  it("passes iconUrl to Panel as watermark", () => {
    const { container } = render(MtgCard, {
      props: { card: bolt, iconUrl: "https://example.com/icon.png" },
    });
    const watermark = container.querySelector(".panel-watermark") as HTMLImageElement;
    expect(watermark).toBeTruthy();
    expect(watermark.src).toBe("https://example.com/icon.png");
  });

  it("does not render watermark when iconUrl absent", () => {
    const { container } = render(MtgCard, { props: { card: bolt } });
    expect(container.querySelector(".panel-watermark")).toBeNull();
  });
});
