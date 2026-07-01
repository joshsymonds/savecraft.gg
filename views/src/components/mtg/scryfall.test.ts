import { describe, expect, it } from "vitest";

import { cardImageUrl } from "./scryfall";

const BOLT_ID = "77c6fa74-5543-42ac-9ead-0e890b188e99";

describe("cardImageUrl", () => {
  it("builds a normal-size URL by default", () => {
    expect(cardImageUrl(BOLT_ID)).toBe(
      "https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
  });

  it("builds a small-size URL", () => {
    expect(cardImageUrl(BOLT_ID, "small")).toBe(
      "https://cards.scryfall.io/small/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
  });

  it("builds a normal-size URL when explicitly requested", () => {
    expect(cardImageUrl(BOLT_ID, "normal")).toBe(
      "https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
  });

  it("builds a large-size URL", () => {
    expect(cardImageUrl(BOLT_ID, "large")).toBe(
      "https://cards.scryfall.io/large/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
    );
  });

  it("returns null for an empty string", () => {
    expect(cardImageUrl("")).toBeNull();
  });

  it("returns null for an id that is too short", () => {
    expect(cardImageUrl("77c6fa74-5543-42ac-9ead-0e890b188e9")).toBeNull();
  });

  it("returns null for an id that is too long", () => {
    expect(cardImageUrl("77c6fa74-5543-42ac-9ead-0e890b188e999")).toBeNull();
  });

  it("returns null for an id with uppercase hex characters", () => {
    expect(cardImageUrl("77C6FA74-5543-42ac-9ead-0e890b188e99")).toBeNull();
  });

  it("returns null for an id with invalid (non-hex) characters", () => {
    expect(cardImageUrl("zzc6fa74-5543-42ac-9ead-0e890b188e99")).toBeNull();
  });

  it("returns null for an id missing dashes", () => {
    expect(cardImageUrl("77c6fa7455434 2ac9ead0e890b188e99".replace(/ /g, ""))).toBeNull();
  });

  it("returns null for a plain 32-char hex string without dashes", () => {
    expect(cardImageUrl("77c6fa74554342ac9ead0e890b188e99")).toBeNull();
  });
});
