import { afterEach, describe, expect, it, vi } from "vitest";

import { countUp, formatStatValue, parseStatValue } from "./count-up.js";

describe("parseStatValue", () => {
  it("parses a plain integer", () => {
    expect(parseStatValue(47)).toEqual({
      prefix: "",
      num: 47,
      decimals: 0,
      grouped: false,
      suffix: "",
    });
  });

  it("parses a decimal number input preserving its precision", () => {
    expect(parseStatValue(41.3)).toEqual({
      prefix: "",
      num: 41.3,
      decimals: 1,
      grouped: false,
      suffix: "",
    });
  });

  it("parses a percentage string", () => {
    expect(parseStatValue("85.5%")).toEqual({
      prefix: "",
      num: 85.5,
      decimals: 1,
      grouped: false,
      suffix: "%",
    });
  });

  it("parses a prefixed approximation", () => {
    expect(parseStatValue("~134")).toEqual({
      prefix: "~",
      num: 134,
      decimals: 0,
      grouped: false,
      suffix: "",
    });
  });

  it("parses thousands-grouped values", () => {
    expect(parseStatValue("1,137")).toEqual({
      prefix: "",
      num: 1137,
      decimals: 0,
      grouped: true,
      suffix: "",
    });
  });

  it("parses negative rates with unit suffixes", () => {
    expect(parseStatValue("-2/min")).toEqual({
      prefix: "",
      num: -2,
      decimals: 0,
      grouped: false,
      suffix: "/min",
    });
  });

  it("rejects letter grades", () => {
    expect(parseStatValue("A+")).toBeNull();
  });

  it("rejects ratios — two numeric runs must not tween", () => {
    expect(parseStatValue("1:312")).toBeNull();
  });

  it("rejects empty strings", () => {
    expect(parseStatValue("")).toBeNull();
  });
});

describe("formatStatValue", () => {
  it.each(["85.5%", "1,137", "~134", "-2/min"])(
    "round-trips %s at its own value",
    (input) => {
      const parts = parseStatValue(input);
      expect(parts).not.toBeNull();
      expect(formatStatValue(parts!, parts!.num)).toBe(input);
    },
  );

  it("round-trips numeric input", () => {
    const parts = parseStatValue(47);
    expect(formatStatValue(parts!, 47)).toBe("47");
  });

  it("formats intermediate values at the original precision", () => {
    const parts = parseStatValue("85.5%");
    expect(formatStatValue(parts!, 42.75)).toBe("42.8%");
  });

  it("rounds intermediate integers", () => {
    const parts = parseStatValue("~134");
    expect(formatStatValue(parts!, 88.6)).toBe("~89");
  });

  it("applies thousands grouping to intermediate values", () => {
    const parts = parseStatValue("1,137");
    expect(formatStatValue(parts!, 1056.7)).toBe("1,057");
  });

  it("does not group small intermediate values of grouped inputs", () => {
    const parts = parseStatValue("1,137");
    expect(formatStatValue(parts!, 568.5)).toBe("569");
  });

  it("keeps the sign on negative intermediates", () => {
    const parts = parseStatValue("-2/min");
    expect(formatStatValue(parts!, -0.8)).toBe("-1/min");
  });
});

describe("countUp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sets non-tweenable values to their final form synchronously", () => {
    const calls: string[] = [];
    countUp("A+", (s) => calls.push(s));
    expect(calls).toEqual(["A+"]);
  });

  it("sets the final value synchronously under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const calls: string[] = [];
    countUp("~134 runs", (s) => calls.push(s));
    expect(calls).toEqual(["~134 runs"]);
  });

  /** happy-dom doesn't expose rAF as a test global — shim it over setTimeout. */
  function stubRaf() {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  }

  it("starts tweenable values at their zero state synchronously — no final-value flash", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    stubRaf();
    const calls: string[] = [];
    const cancel = countUp("~134 runs", (s) => calls.push(s));
    expect(calls[0]).toBe("~0 runs");
    cancel();
  });

  it("lands exactly on the source string when the tween completes", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    stubRaf();
    const calls: string[] = [];
    countUp("85.5%", (s) => calls.push(s));
    vi.advanceTimersByTime(1000);
    expect(calls[0]).toBe("0.0%");
    expect(calls[calls.length - 1]).toBe("85.5%");
  });
});
