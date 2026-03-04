import { get } from "svelte/store";
import { describe, expect, it } from "vitest";

import { pendingLinkCode } from "./link-code";

describe("pendingLinkCode", () => {
  it("has null as initial value", () => {
    expect(get(pendingLinkCode)).toBeNull();
  });

  it("stores a link code", () => {
    pendingLinkCode.set("482913");
    expect(get(pendingLinkCode)).toBe("482913");
    pendingLinkCode.set(null);
  });

  it("clears when set to null", () => {
    pendingLinkCode.set("123456");
    pendingLinkCode.set(null);
    expect(get(pendingLinkCode)).toBeNull();
  });
});
