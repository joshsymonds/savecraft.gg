import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlugin } from "./plugins";

describe("loadPlugin requires_save", () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "savecraft-plugin-test-"));
    mkdirSync(join(tmp, "fixture"), { recursive: true });
    writeFileSync(
      join(tmp, "fixture", "plugin.toml"),
      `
game_id = "fixture"
sources = ["wasm"]
name = "Fixture"
description = "test"
channel = "alpha"
coverage = "partial"

[reference.modules.default_module]
name = "Default"
description = "omitted flag"

[reference.modules.explicit_true]
name = "Explicit True"
description = "explicitly true"
requires_save = true

[reference.modules.explicit_false]
name = "Explicit False"
description = "explicitly false"
requires_save = false

[reference.modules.malformed]
name = "Malformed"
description = "wrong type"
requires_save = "yes"
`,
    );
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("defaults requires_save to true when omitted", () => {
    const game = loadPlugin("fixture", tmp);
    const mod = game.referenceModules.find((m) => m.name === "Default")!;
    expect(mod.requires_save).toBe(true);
  });

  it("honors explicit requires_save = true", () => {
    const game = loadPlugin("fixture", tmp);
    const mod = game.referenceModules.find((m) => m.name === "Explicit True")!;
    expect(mod.requires_save).toBe(true);
  });

  it("honors explicit requires_save = false", () => {
    const game = loadPlugin("fixture", tmp);
    const mod = game.referenceModules.find((m) => m.name === "Explicit False")!;
    expect(mod.requires_save).toBe(false);
  });

  it("treats malformed (non-boolean) requires_save as default true", () => {
    const game = loadPlugin("fixture", tmp);
    const mod = game.referenceModules.find((m) => m.name === "Malformed")!;
    expect(mod.requires_save).toBe(true);
  });

  it("handles mixed module shapes in one plugin", () => {
    const game = loadPlugin("fixture", tmp);
    const pairs = game.referenceModules.map((m) => [m.name, m.requires_save] as const);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ["Default", true],
        ["Explicit True", true],
        ["Explicit False", false],
        ["Malformed", true],
      ]),
    );
  });
});
