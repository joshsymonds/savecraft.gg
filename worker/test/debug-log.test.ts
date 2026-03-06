import { beforeEach, describe, expect, it } from "vitest";

import { DebugLog } from "../src/debug-log";

/* eslint-disable unicorn/prefer-single-call -- DebugLog.push is not Array#push */

/** Capture output from DebugLog instead of hitting console.log */
function createTestLog(maxSize?: number): { log: DebugLog; output: string[] } {
  const output: string[] = [];
  const log = new DebugLog(maxSize, (json: string) => output.push(json));
  return { log, output };
}

describe("DebugLog", () => {
  let log: DebugLog;

  describe("basic operations", () => {
    beforeEach(() => {
      ({ log } = createTestLog());
    });

    it("stores entries and returns them newest-first", () => {
      log.push("info", "first");
      log.push("info", "second");
      log.push("info", "third");

      const entries = log.entries();
      expect(entries).toHaveLength(3);
      expect(entries[0]!.msg).toBe("third");
      expect(entries[1]!.msg).toBe("second");
      expect(entries[2]!.msg).toBe("first");
    });

    it("includes timestamp and level on each entry", () => {
      const before = Date.now();
      log.push("warn", "something happened", { key: "value" });
      const after = Date.now();

      const [entry] = log.entries();
      expect(entry!.level).toBe("warn");
      expect(entry!.msg).toBe("something happened");
      expect(entry!.ctx).toEqual({ key: "value" });
      expect(entry!.ts).toBeGreaterThanOrEqual(before);
      expect(entry!.ts).toBeLessThanOrEqual(after);
    });

    it("ctx is optional", () => {
      log.push("info", "no context");
      const [entry] = log.entries();
      expect(entry!.ctx).toBeUndefined();
    });

    it("reports size correctly", () => {
      expect(log.size).toBe(0);
      log.push("info", "one");
      expect(log.size).toBe(1);
      log.push("info", "two");
      expect(log.size).toBe(2);
    });

    it("clears all entries", () => {
      log.push("info", "one");
      log.push("info", "two");
      log.clear();
      expect(log.size).toBe(0);
      expect(log.entries()).toEqual([]);
    });
  });

  describe("eviction", () => {
    it("evicts oldest entries when over max size", () => {
      ({ log } = createTestLog(3));
      log.push("info", "one");
      log.push("info", "two");
      log.push("info", "three");
      log.push("info", "four");

      expect(log.size).toBe(3);
      const entries = log.entries();
      expect(entries[0]!.msg).toBe("four");
      expect(entries[1]!.msg).toBe("three");
      expect(entries[2]!.msg).toBe("two");
    });
  });

  describe("filtering", () => {
    beforeEach(() => {
      log = new DebugLog();
      log.push("debug", "debug msg");
      log.push("info", "info msg");
      log.push("warn", "warn msg");
      log.push("error", "error msg");
    });

    it("filters by level", () => {
      const errors = log.entries({ level: "error" });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.msg).toBe("error msg");
    });

    it("limits number of results", () => {
      const limited = log.entries({ limit: 2 });
      expect(limited).toHaveLength(2);
      expect(limited[0]!.msg).toBe("error msg");
      expect(limited[1]!.msg).toBe("warn msg");
    });

    it("combines level and limit filters", () => {
      log.push("error", "second error");
      log.push("error", "third error");
      const result = log.entries({ level: "error", limit: 2 });
      expect(result).toHaveLength(2);
      expect(result[0]!.msg).toBe("third error");
      expect(result[1]!.msg).toBe("second error");
    });
  });

  describe("edge cases", () => {
    it("entries returns empty array when no entries exist", () => {
      const { log: emptyLog } = createTestLog();
      expect(emptyLog.entries()).toEqual([]);
      expect(emptyLog.entries({ level: "error" })).toEqual([]);
      expect(emptyLog.entries({ limit: 10 })).toEqual([]);
    });

    it("limit of 0 returns empty array", () => {
      const { log: testLog } = createTestLog();
      testLog.push("info", "test");
      expect(testLog.entries({ limit: 0 })).toEqual([]);
    });

    it("limit larger than entries returns all entries", () => {
      const { log: testLog } = createTestLog();
      testLog.push("info", "one");
      testLog.push("info", "two");
      expect(testLog.entries({ limit: 100 })).toHaveLength(2);
    });

    it("maxSize of 1 keeps only the latest entry", () => {
      const { log: tinyLog } = createTestLog(1);
      tinyLog.push("info", "first");
      tinyLog.push("info", "second");
      expect(tinyLog.size).toBe(1);
      expect(tinyLog.entries()[0]!.msg).toBe("second");
    });
  });

  describe("output callback", () => {
    it("emits structured JSON on push", () => {
      const { log: testLog, output } = createTestLog();
      testLog.push("info", "test message", { source: "unit-test" });

      expect(output).toHaveLength(1);
      const parsed = JSON.parse(output[0]!) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        level: "info",
        msg: "test message",
        ctx: { source: "unit-test" },
      });
      expect(parsed).toHaveProperty("ts");
    });
  });
});
