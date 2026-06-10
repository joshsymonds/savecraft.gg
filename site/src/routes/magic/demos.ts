// Commander before/after demo conversation for the /magic landing page.
// The Standard rotation demo is shared with the home page and lives in
// $lib/demos/standard-rotation.
//
// Facts verified 2026-06-10 against Savecraft's commander_lookup module:
// Atraxa, Praetors' Voice has 41,638 EDHREC decks; inclusion rates —
// Doubling Season 32%, Brokers Ascendancy 33%, Tamiyo, Field Researcher 27%.
import type { DemoMessage } from "$lib/components/marketing/types";

export const withoutCommander: DemoMessage[] = [
  { role: "player", text: "Is my Atraxa superfriends deck missing anything?" },
  {
    role: "ai",
    text: "Your Atraxa deck looks solid -- lots of options for improvement depending on your playstyle. I'd suggest adding more planeswalkers and counters synergy.",
  },
];

export const withCommander: DemoMessage[] = [
  { role: "player", text: "Is my Atraxa superfriends deck missing anything?" },
  {
    role: "ai",
    text: "58% overlap with EDHREC's average Atraxa build (41,638 decks). For superfriends you're missing Doubling Season (32% of Atraxa lists run it), Brokers Ascendancy (33%), and Tamiyo, Field Researcher (27%). Your 4 extras are off-meta but thematic -- keep them.",
  },
];
