<script module lang="ts">
  import type { Source } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SourceDetailModal from "./SourceDetailModal.svelte";

  const { Story } = defineMeta({
    title: "Components/SourceDetailModal",
    tags: ["autodocs"],
  });

  const daemonOnline: Source = {
    id: "src-1",
    name: "gaming-pc",
    sourceKind: "daemon",
    hostname: "GAMING-PC",
    status: "online",
    version: "0.4.2",
    lastSeen: "Just now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "3 saves",
        saves: [
          {
            saveUuid: "s1",
            saveName: "Atmus",
            summary: "Hammerdin, Level 89 Paladin",
            lastUpdated: "2 min ago",
            status: "success",
          },
          {
            saveUuid: "s2",
            saveName: "Blizzara",
            summary: "Blizzard Sorc, Level 78",
            lastUpdated: "1 hr ago",
            status: "success",
          },
          {
            saveUuid: "s3",
            saveName: "TrapSin",
            summary: "Lightning Traps, Level 45",
            lastUpdated: "3 hrs ago",
            status: "success",
          },
        ],
        path: String.raw`C:\Users\Josh\Saved Games\Diablo II Resurrected`,
      },
      {
        gameId: "sdv",
        name: "Stardew Valley",
        status: "watching",
        statusLine: "1 save",
        saves: [
          {
            saveUuid: "s4",
            saveName: "Farm_181790318",
            summary: "Year 3, Spring 12",
            lastUpdated: "1 day ago",
            status: "success",
          },
        ],
        path: String.raw`C:\Users\Josh\AppData\Roaming\StardewValley\Saves`,
      },
    ],
  };

  const daemonOffline: Source = {
    id: "src-2",
    name: "steam-deck",
    sourceKind: "daemon",
    hostname: "STEAM-DECK",
    status: "offline",
    version: "0.4.1",
    lastSeen: "3 days ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "1 save",
        saves: [
          {
            saveUuid: "s5",
            saveName: "Atmus",
            summary: "Hammerdin, Level 89 Paladin",
            lastUpdated: "3 days ago",
            status: "success",
          },
        ],
        path: "/home/deck/.local/share/Diablo II Resurrected/Save",
      },
    ],
  };

  const apiSource: Source = {
    id: "src-3",
    name: "WoW API",
    sourceKind: "api",
    hostname: null,
    status: "online",
    version: null,
    lastSeen: "Just now",
    capabilities: { canRescan: false, canReceiveConfig: false },
    games: [
      {
        gameId: "wow",
        name: "World of Warcraft",
        status: "watching",
        statusLine: "2 characters",
        saves: [
          {
            saveUuid: "s6",
            saveName: "Thrall-Area52",
            summary: "Orc Shaman, Level 70",
            lastUpdated: "5 min ago",
            status: "success",
          },
          {
            saveUuid: "s7",
            saveName: "Jaina-Proudmoore",
            summary: "Human Mage, Level 70",
            lastUpdated: "12 min ago",
            status: "success",
          },
        ],
      },
    ],
  };

  const daemonError: Source = {
    id: "src-4",
    name: "work-laptop",
    sourceKind: "daemon",
    hostname: "WORK-LAPTOP",
    status: "error",
    version: "0.4.0",
    lastSeen: "10 min ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "error",
        statusLine: "Parse error",
        saves: [],
        path: String.raw`C:\Games\D2R\Save`,
        error: "Failed to parse save file: unexpected EOF at offset 0x1A3",
      },
      {
        gameId: "bg3",
        name: "Baldur's Gate 3",
        status: "not_found",
        statusLine: "Not found",
        saves: [],
        path: String.raw`C:\Users\Josh\AppData\Local\Larian Studios`,
        error: "Save directory not found at configured path",
      },
    ],
  };
</script>

<Story name="DaemonOnline">
  <div style="width: 520px; position: relative; height: 550px;">
    <SourceDetailModal source={daemonOnline} onclose={() => alert("Close")} />
  </div>
</Story>

<Story name="DaemonOffline">
  <div style="width: 520px; position: relative; height: 400px;">
    <SourceDetailModal source={daemonOffline} onclose={() => alert("Close")} />
  </div>
</Story>

<Story name="ApiSource">
  <div style="width: 520px; position: relative; height: 300px;">
    <SourceDetailModal source={apiSource} onclose={() => alert("Close")} />
  </div>
</Story>

<Story name="DaemonError">
  <div style="width: 520px; position: relative; height: 550px;">
    <SourceDetailModal source={daemonError} onclose={() => alert("Close")} />
  </div>
</Story>
