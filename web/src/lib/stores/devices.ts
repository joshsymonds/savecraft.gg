import type { Device } from "$lib/types/device";
import type { Readable } from "svelte/store";
import { readable } from "svelte/store";

const MOCK_DEVICES: Device[] = [
  {
    id: "steam-deck-01",
    name: "STEAM-DECK",
    status: "online",
    version: "v0.1.0",
    os: "SteamOS 3.5",
    lastSeen: "now",
    games: [
      { gameId: "d2r", name: "D2R", icon: "D", status: "watching", statusLine: "3 characters" },
      { gameId: "stardew", name: "STARDEW", icon: "S", status: "watching", statusLine: "1 farm" },
      { gameId: "stellaris", name: "STELLARIS", icon: "X", status: "watching", statusLine: "2 empires" },
      { gameId: "bg3", name: "BG3", icon: "B", status: "not_found", statusLine: "not installed" },
    ],
  },
  {
    id: "desktop-pc-01",
    name: "DESKTOP-PC",
    status: "offline",
    version: "v0.1.0",
    os: "Windows 11",
    lastSeen: "3 hours ago",
    games: [
      { gameId: "d2r", name: "D2R", icon: "D", status: "watching", statusLine: "2 characters" },
      { gameId: "elden-ring", name: "ELDEN RING", icon: "E", status: "watching", statusLine: "1 tarnished" },
      { gameId: "stellaris", name: "STELLARIS", icon: "X", status: "watching", statusLine: "4 empires" },
      { gameId: "fallout", name: "FALLOUT 4", icon: "F", status: "error", statusLine: "parse error" },
    ],
  },
  {
    id: "laptop-01",
    name: "THINKPAD",
    status: "error",
    version: "v0.0.9",
    os: "Fedora 41",
    lastSeen: "now",
    games: [
      { gameId: "stardew", name: "STARDEW", icon: "S", status: "watching", statusLine: "2 farms" },
      { gameId: "civ6", name: "CIV VI", icon: "C", status: "detected", statusLine: "scanning..." },
    ],
  },
];

export const devices: Readable<Device[]> = readable(MOCK_DEVICES);
