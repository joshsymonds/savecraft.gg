import type { ActivityEventType } from "$lib/types/activity";
import type { Readable } from "svelte/store";
import { readable } from "svelte/store";

export interface ActivityEventData {
  id: string;
  type: ActivityEventType;
  message: string;
  detail?: string;
  time: string;
}

function event(
  type: ActivityEventType,
  message: string,
  time: string,
  detail?: string,
): ActivityEventData {
  return { id: crypto.randomUUID(), type, message, detail, time };
}

/** Realistic event sequences matching the daemon->worker protocol lifecycle. */
const MOCK_EVENTS: ActivityEventData[] = [
  // Atmus parse + push (just happened)
  event("push_completed", "Atmus, Level 74 Warlock (Hell)", "now", "48KB · 340ms"),
  event("push_started", "Uploading Atmus, Level 74 Warlock (Hell)", "now", "48KB"),
  event("parse_completed", "Atmus, Level 74 Warlock (Hell)", "now", "6 sections · 48KB"),
  event("plugin_status", "45 items, 4 socketed", "now", "Atmus.d2s"),
  event("plugin_status", "Character: Atmus, Level 74 Warlock", "now", "Atmus.d2s"),
  event("parse_started", "Parsing Atmus.d2s", "now", "d2r"),

  // Shared stash parse (2 minutes ago)
  event("push_completed", "Shared Stash (Softcore), 60 items", "2m", "12KB · 180ms"),
  event("push_started", "Uploading Shared Stash (Softcore)", "2m", "12KB"),
  event("parse_completed", "Shared Stash (Softcore), 60 items, 0 gold", "2m", "3 sections · 12KB"),
  event("plugin_status", "60 items across 6 tabs", "2m", "ModernSharedStashSoftCoreV2.d2i"),
  event("parse_started", "Parsing ModernSharedStashSoftCoreV2.d2i", "2m", "d2r"),

  // Stardew farm parse (5 minutes ago)
  event("push_completed", "Sunshine Farm, Year 3 Spring", "5m", "24KB · 210ms"),
  event("parse_completed", "Sunshine Farm, Year 3 Spring", "5m", "4 sections · 24KB"),
  event("parse_started", "Parsing Sunshine_123456789", "5m", "stardew"),

  // Failed parse (8 minutes ago)
  event("parse_failed", "Corrupt.d2s — corrupt file", "8m", "item 12: unexpected end of bitstream"),
  event("plugin_status", "Character: SomeGuy, Level 12 Amazon", "8m", "Corrupt.d2s"),
  event("parse_started", "Parsing Corrupt.d2s", "8m", "d2r"),

  // Daemon came online (15 minutes ago)
  event("watching", "Watching D2R saves", "15m", "~/Saved Games/Diablo II Resurrected/"),
  event("watching", "Watching Stardew Valley saves", "15m", "~/.config/StardewValley/Saves/"),
  event("game_detected", "Found Diablo II: Resurrected", "15m", "3 save files"),
  event("game_detected", "Found Stardew Valley", "15m", "1 save file"),
  event("daemon_online", "STEAM-DECK connected", "15m", "v0.1.0 · SteamOS 3.5"),
];

export const activityEvents: Readable<ActivityEventData[]> = readable(MOCK_EVENTS);
