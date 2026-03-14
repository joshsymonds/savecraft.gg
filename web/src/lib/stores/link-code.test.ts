import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const { consumePendingLinkCode, peekPendingLinkCode, setPendingLinkCode } =
  await import("./link-code");

describe("link-code localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
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

  it("rejects an expired code on consume", () => {
    setPendingLinkCode("482913");
    vi.advanceTimersByTime(20 * 60_000 + 1);
    expect(consumePendingLinkCode()).toBeNull();
  });

  it("rejects an expired code on peek", () => {
    setPendingLinkCode("482913");
    vi.advanceTimersByTime(20 * 60_000 + 1);
    expect(peekPendingLinkCode()).toBeNull();
  });

  it("accepts a code just under the TTL", () => {
    setPendingLinkCode("482913");
    vi.advanceTimersByTime(20 * 60_000 - 1);
    expect(consumePendingLinkCode()).toBe("482913");
  });

  it("clears stale code from localStorage on consume", () => {
    setPendingLinkCode("482913");
    vi.advanceTimersByTime(20 * 60_000 + 1);
    consumePendingLinkCode();
    expect(localStorage.getItem("savecraft:linkCode")).toBeNull();
  });

  it("discards corrupt localStorage entries", () => {
    localStorage.setItem("savecraft:linkCode", "not-json");
    expect(consumePendingLinkCode()).toBeNull();
    expect(localStorage.getItem("savecraft:linkCode")).toBeNull();
  });

  it("discards old plain-string format entries", () => {
    localStorage.setItem("savecraft:linkCode", '"482913"');
    expect(consumePendingLinkCode()).toBeNull();
  });
});
