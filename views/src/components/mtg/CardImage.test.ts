import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import CardImage from "./CardImage.svelte";

afterEach(cleanup);

const BOLT_ID = "77c6fa74-5543-42ac-9ead-0e890b188e99";

describe("CardImage", () => {
  it("renders an img with the constructed src, alt text, and lazy loading", () => {
    const { container } = render(CardImage, { props: { scryfallId: BOLT_ID, name: "Lightning Bolt" } });
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toBe(
      "https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
    expect(img!.alt).toBe("Lightning Bolt");
    expect(img!.loading).toBe("lazy");
  });

  it("uses the requested size in the constructed src", () => {
    const { container } = render(CardImage, {
      props: { scryfallId: BOLT_ID, name: "Lightning Bolt", size: "small" },
    });
    const img = container.querySelector("img");
    expect(img!.src).toBe(
      "https://cards.scryfall.io/small/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
  });

  it("renders nothing for a malformed scryfallId", () => {
    const { container } = render(CardImage, { props: { scryfallId: "not-a-real-id", name: "Bogus Card" } });
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing for an empty scryfallId", () => {
    const { container } = render(CardImage, { props: { scryfallId: "", name: "Bogus Card" } });
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing and calls onfallback after the img fires an error event", async () => {
    const onfallback = vi.fn();
    const { container } = render(CardImage, {
      props: { scryfallId: BOLT_ID, name: "Lightning Bolt", onfallback },
    });
    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    await fireEvent.error(img!);

    expect(container.querySelector("img")).toBeNull();
    expect(onfallback).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onfallback is not provided and the img errors", async () => {
    const { container } = render(CardImage, { props: { scryfallId: BOLT_ID, name: "Lightning Bolt" } });
    const img = container.querySelector("img");

    await fireEvent.error(img!);

    expect(container.querySelector("img")).toBeNull();
  });
});
