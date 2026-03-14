import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const { consumePendingLinkCode, peekPendingLinkCode, setPendingLinkCode } =
  await import("./link-code");

describe("link-code localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns null when no code is pending", () => {
    expect(consumePendingLinkCode()).toBeNull();
  });

  it("stores and retrieves a link code", () => {
    setPendingLinkCode("482913");
    expect(consumePendingLinkCode()).toBe("482913");
  });

  it("clears the code after consuming it", () => {
    setPendingLinkCode("482913");
    consumePendingLinkCode();
    expect(consumePendingLinkCode()).toBeNull();
  });

  it("overwrites a previous code", () => {
    setPendingLinkCode("111111");
    setPendingLinkCode("222222");
    expect(consumePendingLinkCode()).toBe("222222");
  });

  it("peeks without consuming", () => {
    setPendingLinkCode("482913");
    expect(peekPendingLinkCode()).toBe("482913");
    // Still there after peeking.
    expect(peekPendingLinkCode()).toBe("482913");
    // Consume actually removes it.
    expect(consumePendingLinkCode()).toBe("482913");
    expect(peekPendingLinkCode()).toBeNull();
  });

  it("peek returns null when no code is pending", () => {
    expect(peekPendingLinkCode()).toBeNull();
  });
});
