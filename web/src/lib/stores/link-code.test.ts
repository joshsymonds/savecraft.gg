import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const { consumePendingLinkCode, setPendingLinkCode } = await import("./link-code");

describe("link-code sessionStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
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
});
