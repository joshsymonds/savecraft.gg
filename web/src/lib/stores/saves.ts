import type { Save } from "$lib/types/save";
import type { Readable } from "svelte/store";
import { readable } from "svelte/store";

const MOCK_SAVES: Save[] = [
  // D2R characters
  {
    id: "save-atmus",
    gameId: "d2r",
    gameName: "Diablo II: Resurrected",
    characterName: "Atmus",
    summary: "Level 74 Warlock, Hell Act 3, Reign of the Warlock",
    lastUpdated: "2 minutes ago",
    snapshotSize: "48KB",
  },
  {
    id: "save-valkyrie",
    gameId: "d2r",
    gameName: "Diablo II: Resurrected",
    characterName: "Valkyrie",
    summary: "Level 89 Paladin, Hell Act 5, Hammerdin",
    lastUpdated: "1 hour ago",
    snapshotSize: "52KB",
  },
  {
    id: "save-frostbite",
    gameId: "d2r",
    gameName: "Diablo II: Resurrected",
    characterName: "Frostbite",
    summary: "Level 31 Sorceress, Nightmare Act 1, Blizzard",
    lastUpdated: "3 hours ago",
    snapshotSize: "28KB",
  },
  {
    id: "save-shared-stash",
    gameId: "d2r",
    gameName: "Diablo II: Resurrected",
    characterName: "Shared Stash (Softcore)",
    summary: "60 items, 0 gold, 6 tabs",
    lastUpdated: "2 minutes ago",
    snapshotSize: "12KB",
  },

  // Stardew Valley
  {
    id: "save-sunshine",
    gameId: "stardew",
    gameName: "Stardew Valley",
    characterName: "Sunshine Farm",
    summary: "Year 3 Spring, 1.2M gold, Greenhouse unlocked",
    lastUpdated: "5 minutes ago",
    snapshotSize: "24KB",
  },

  // Stellaris
  {
    id: "save-terran",
    gameId: "stellaris",
    gameName: "Stellaris",
    characterName: "Terran Hegemony",
    summary: "Year 2350, 12 systems, Federation president",
    lastUpdated: "2 days ago",
    snapshotSize: "180KB",
  },
  {
    id: "save-hivemind",
    gameId: "stellaris",
    gameName: "Stellaris",
    characterName: "The Swarm",
    summary: "Year 2280, 8 systems, Devouring Swarm",
    lastUpdated: "5 days ago",
    snapshotSize: "145KB",
  },

  // Elden Ring
  {
    id: "save-tarnished",
    gameId: "elden-ring",
    gameName: "Elden Ring",
    characterName: "Gwyndolin",
    summary: "Level 142, Raya Lucaria, INT/DEX build",
    lastUpdated: "1 day ago",
    snapshotSize: "64KB",
  },
];

export const saves: Readable<Save[]> = readable(MOCK_SAVES);
