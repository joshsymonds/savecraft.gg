<script module lang="ts">
  import type { Device } from "$lib/types/device";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import DeviceWindow from "./DeviceWindow.svelte";

  const { Story } = defineMeta({
    title: "Components/DeviceWindow",
    tags: ["autodocs"],
  });

  const onlineDevice: Device = {
    id: "steam-deck",
    name: "STEAM-DECK",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
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
            notes: [
              {
                id: "n1",
                title: "Maxroll Blessed Hammer Build",
                preview:
                  "## Gear Priority\n\nHelm: Harlequin Crest (Shako) — +2 skills, DR, MF. BiS.\nArmor: Enigma in Mage Plate — Teleport, +2 skills.",
                source: "user",
                sizeBytes: 8200,
                updatedAt: "2d ago",
              },
              {
                id: "n2",
                title: "Farming Goals",
                preview:
                  "Need: Ber rune, 3os Mage Plate\nFound: Jah rune (2/24), Vex (2/20)\n\nBest spots: Travincal, Chaos Sanctuary, Cows",
                source: "user",
                sizeBytes: 340,
                updatedAt: "1d ago",
              },
            ],
          },
          {
            saveUuid: "s2",
            saveName: "BlizzSorc",
            summary: "Sorceress · Level 76 · Nightmare",
            lastUpdated: "1d ago",
            status: "success",
            notes: [],
          },
          {
            saveUuid: "s3",
            saveName: "SharedStash",
            summary: "Shared stash file",
            lastUpdated: "2m ago",
            status: "error",
            notes: [],
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
            notes: [
              {
                id: "n3",
                title: "Perfection Checklist",
                preview: "Missing: Golden Clock ($10M), 4 Obelisks\nShipping: 6 items remaining",
                source: "user",
                sizeBytes: 1100,
                updatedAt: "3d ago",
              },
            ],
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
            notes: [],
          },
          {
            saveUuid: "s6",
            saveName: "Tzynn Empire",
            summary: "Year 2280 · Militarist Xenophobe",
            lastUpdated: "5d ago",
            status: "success",
            notes: [],
          },
        ],
      },
    ],
  };

  const offlineDevice: Device = {
    id: "desktop-pc",
    name: "DESKTOP-PC",
    status: "offline",
    version: "v0.1.0",
    lastSeen: "3 hours ago",
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
            notes: [],
          },
        ],
      },
    ],
  };

  const emptyDevice: Device = {
    id: "new-pc",
    name: "NEW-PC",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
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
</script>

<Story name="DeviceOnline">
  <div style="width: 700px;">
    <DeviceWindow
      device={onlineDevice}
      onrescan={() => alert("rescan")}
      ondiscover={() => alert("discover")}
      onconfig={() => alert("config")}
    />
  </div>
</Story>

<Story name="DeviceOffline">
  <div style="width: 700px;">
    <DeviceWindow device={offlineDevice} />
  </div>
</Story>

<Story name="DeviceEmpty">
  <div style="width: 700px;">
    <DeviceWindow device={emptyDevice} />
  </div>
</Story>

<Story name="GameLevel">
  <div style="width: 700px;">
    <DeviceWindow device={onlineDevice} initialGameId="d2r" />
  </div>
</Story>

<Story name="SaveWithNotes">
  <div style="width: 700px;">
    <DeviceWindow device={onlineDevice} initialGameId="d2r" initialSaveUuid="s1" />
  </div>
</Story>

<Story name="SaveEmpty">
  <div style="width: 700px;">
    <DeviceWindow device={onlineDevice} initialGameId="d2r" initialSaveUuid="s2" />
  </div>
</Story>
