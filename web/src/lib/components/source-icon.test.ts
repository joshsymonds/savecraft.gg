import { describe, expect, it } from "vitest";

import { getSourceIconUrl } from "./source-icon";

describe("getSourceIconUrl", () => {
  it("returns adapter icon for adapter sources", () => {
    expect(getSourceIconUrl({ sourceKind: "adapter", platform: null, device: null })).toBe(
      "/icons/sources/adapter.png",
    );
  });

  it("returns steam-deck icon when device is steam_deck", () => {
    expect(
      getSourceIconUrl({ sourceKind: "daemon", platform: "linux", device: "steam_deck" }),
    ).toBe("/icons/sources/steam-deck.png");
  });

  it("returns windows icon for windows platform", () => {
    expect(getSourceIconUrl({ sourceKind: "daemon", platform: "windows", device: null })).toBe(
      "/icons/sources/windows.png",
    );
  });

  it("returns linux icon for linux platform", () => {
    expect(getSourceIconUrl({ sourceKind: "daemon", platform: "linux", device: null })).toBe(
      "/icons/sources/linux.png",
    );
  });

  it("returns macos icon for darwin platform", () => {
    expect(getSourceIconUrl({ sourceKind: "daemon", platform: "darwin", device: null })).toBe(
      "/icons/sources/macos.png",
    );
  });

  it("returns generic icon for unknown platform", () => {
    expect(getSourceIconUrl({ sourceKind: "daemon", platform: null, device: null })).toBe(
      "/icons/sources/generic.png",
    );
  });

  it("steam_deck device takes priority over linux platform", () => {
    expect(
      getSourceIconUrl({ sourceKind: "daemon", platform: "linux", device: "steam_deck" }),
    ).toBe("/icons/sources/steam-deck.png");
  });

  it("adapter takes priority over device", () => {
    expect(
      getSourceIconUrl({ sourceKind: "adapter", platform: "linux", device: "steam_deck" }),
    ).toBe("/icons/sources/adapter.png");
  });
});
