<script module lang="ts">
  import type { NoteSummary, Source } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SourceWindow from "./SourceWindow.svelte";

  const { Story } = defineMeta({
    title: "Components/SourceWindow",
    tags: ["autodocs"],
  });

  const mockNotes: Record<string, NoteSummary[]> = {
    s1: [
      {
        id: "n1",
        title: "Maxroll Blessed Hammer Build",
        content:
          "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills.",
        source: "user",
        sizeBytes: 8200,
        updatedAt: "2d ago",
      },
      {
        id: "n2",
        title: "Farming Goals",
        content:
          "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)\n\nBest spots: Travincal, Chaos Sanctuary, Cows",
        source: "user",
        sizeBytes: 340,
        updatedAt: "1d ago",
      },
    ],
    s4: [
      {
        id: "n3",
        title: "Perfection Checklist",
        content: "Missing: Golden Clock ($10M), 4 Obelisks\nShipping: 6 items remaining",
        source: "user",
        sizeBytes: 1100,
        updatedAt: "3d ago",
      },
    ],
  };

  function mockLoadNotes(saveUuid: string): Promise<NoteSummary[]> {
    return Promise.resolve(mockNotes[saveUuid] ?? []);
  }

  // --- Daemon source (full capabilities, multi-game) ---

  const daemonSource: Source = {
    id: "steam-deck",
    name: "DAEMON · STEAM-DECK",
    sourceKind: "daemon",
    hostname: "steam-deck",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "3 characters",
        path: "~/.local/share/Diablo II Resurrected/Save",
        error: "SharedStash.d2i — unsupported format version 0x62",
        saves: [
          {
            saveUuid: "s1",
            saveName: "Hammerdin",
            summary: "Paladin · Level 89 · Hell",
            lastUpdated: "2m ago",
            status: "success",
          },
          {
            saveUuid: "s2",
            saveName: "BlizzSorc",
            summary: "Sorceress · Level 76 · Nightmare",
            lastUpdated: "1d ago",
            status: "success",
          },
          {
            saveUuid: "s3",
            saveName: "SharedStash",
            summary: "Shared stash file",
            lastUpdated: "2m ago",
            status: "error",
          },
        ],
      },
      {
        gameId: "stardew",
        name: "Stardew Valley",
        status: "watching",
        statusLine: "1 farm found",
        path: "~/.config/StardewValley/Saves",
        saves: [
          {
            saveUuid: "s4",
            saveName: "Sunrise Farm — Luna",
            summary: "Year 3 · Fall · 64% Perfection",
            lastUpdated: "4h ago",
            status: "success",
          },
        ],
      },
      {
        gameId: "stellaris",
        name: "Stellaris",
        status: "watching",
        statusLine: "2 empires found",
        saves: [
          {
            saveUuid: "s5",
            saveName: "United Nations of Earth",
            summary: "Year 2340 · Federation Builder",
            lastUpdated: "2d ago",
            status: "success",
          },
          {
            saveUuid: "s6",
            saveName: "Tzynn Empire",
            summary: "Year 2280 · Militarist Xenophobe",
            lastUpdated: "5d ago",
            status: "success",
          },
        ],
      },
    ],
  };

  const offlineSource: Source = {
    id: "desktop-pc",
    name: "DAEMON · DESKTOP-PC",
    sourceKind: "daemon",
    hostname: "desktop-pc",
    status: "offline",
    version: "v0.1.0",
    lastSeen: "3 hours ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "2 characters",
        saves: [
          {
            saveUuid: "s7",
            saveName: "Hammerdin",
            summary: "Paladin · Level 89 · Hell",
            lastUpdated: "3h ago",
            status: "success",
          },
        ],
      },
    ],
  };

  const emptySource: Source = {
    id: "new-pc",
    name: "DAEMON · NEW-PC",
    sourceKind: "daemon",
    hostname: "new-pc",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "bg3",
        name: "Baldur's Gate 3",
        status: "not_found",
        statusLine: "not installed",
        saves: [],
      },
    ],
  };

  const errorSource: Source = {
    id: "broken-pc",
    name: "DAEMON · BROKEN-PC",
    sourceKind: "daemon",
    hostname: "broken-pc",
    status: "error",
    version: "v0.1.0",
    lastSeen: "5m ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "error",
        statusLine: "parse error",
        error: "SharedStash.d2i — unsupported format version 0x62",
        saves: [],
      },
    ],
  };

  const detectedSource: Source = {
    id: "fresh-install",
    name: "DAEMON · FRESH-INSTALL",
    sourceKind: "daemon",
    hostname: "fresh-install",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "detected",
        statusLine: "scanning...",
        saves: [],
      },
      {
        gameId: "stardew",
        name: "Stardew Valley",
        status: "not_found",
        statusLine: "not installed",
        saves: [],
      },
    ],
  };

  // --- Plugin source (no rescan, no config, single game) ---

  const pluginSource: Source = {
    id: "rimworld-plugin",
    name: "PLUGIN · GAMING-RIG",
    sourceKind: "plugin",
    hostname: "gaming-rig",
    status: "online",
    version: "v1.0.0",
    lastSeen: "now",
    capabilities: { canRescan: false, canReceiveConfig: false },
    games: [
      {
        gameId: "rimworld",
        name: "RimWorld",
        status: "watching",
        statusLine: "1 colony",
        saves: [
          {
            saveUuid: "s8",
            saveName: "New Beginnings",
            summary: "Crashlanded · Year 5 · 12 colonists",
            lastUpdated: "10m ago",
            status: "success",
          },
        ],
      },
    ],
  };

  // --- API source (no hostname, no rescan, no config) ---

  const apiSource: Source = {
    id: "api-adapter",
    name: "API",
    sourceKind: "api",
    hostname: null,
    status: "online",
    version: null,
    lastSeen: "now",
    capabilities: { canRescan: false, canReceiveConfig: false },
    games: [
      {
        gameId: "poe2",
        name: "Path of Exile 2",
        status: "watching",
        statusLine: "1 character",
        saves: [
          {
            saveUuid: "s9",
            saveName: "WitchBlaster",
            summary: "Witch · Level 85 · Mapworthy",
            lastUpdated: "1h ago",
            status: "success",
          },
        ],
      },
    ],
  };
</script>

<!-- Daemon source: online, multi-game, full capabilities -->
<Story name="DaemonOnline">
  <div style="width: 700px;">
    <SourceWindow
      source={daemonSource}
      loadNotes={mockLoadNotes}
      onrescan={() => alert("rescan")}
      ondiscover={() => alert("discover")}
      onconfig={() => alert("config")}
    />
  </div>
</Story>

<!-- Just linked: green success banner below title bar -->
<Story name="JustLinked">
  <div style="width: 700px;">
    <SourceWindow source={daemonSource} loadNotes={mockLoadNotes} justLinked={true} />
  </div>
</Story>

<Story name="DaemonOffline">
  <div style="width: 700px;">
    <SourceWindow source={offlineSource} loadNotes={mockLoadNotes} />
  </div>
</Story>

<Story name="DaemonEmpty">
  <div style="width: 700px;">
    <SourceWindow source={emptySource} loadNotes={mockLoadNotes} />
  </div>
</Story>

<Story name="GameLevel">
  <div style="width: 700px;">
    <SourceWindow source={daemonSource} loadNotes={mockLoadNotes} initialGameId="d2r" />
  </div>
</Story>

<Story name="SaveWithNotes">
  <div style="width: 700px;">
    <SourceWindow
      source={daemonSource}
      loadNotes={mockLoadNotes}
      initialGameId="d2r"
      initialSaveUuid="s1"
    />
  </div>
</Story>

<Story name="SaveEmpty">
  <div style="width: 700px;">
    <SourceWindow
      source={daemonSource}
      loadNotes={mockLoadNotes}
      initialGameId="d2r"
      initialSaveUuid="s2"
    />
  </div>
</Story>

<Story name="DaemonError">
  <div style="width: 700px;">
    <SourceWindow source={errorSource} />
  </div>
</Story>

<Story name="DaemonWithDetected">
  <div style="width: 700px;">
    <SourceWindow
      source={detectedSource}
      onactivate={(gameId) => alert(`Activate ${String(gameId)}`)}
    />
  </div>
</Story>

<!-- Plugin source: single game, no rescan/config capabilities -->
<Story name="PluginSource">
  <div style="width: 700px;">
    <SourceWindow source={pluginSource} loadNotes={mockLoadNotes} />
  </div>
</Story>

<!-- API source: no hostname, no rescan/config -->
<Story name="ApiSource">
  <div style="width: 700px;">
    <SourceWindow source={apiSource} loadNotes={mockLoadNotes} />
  </div>
</Story>
