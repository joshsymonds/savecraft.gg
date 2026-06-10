// Before/after demo conversations for the /magic landing page.
//
// Facts verified 2026-06-10 against Savecraft's own modules:
// - card_search: Sheoldred (DMU) rotated out of Standard July 2025;
//   Sephiroth, Fabled SOLDIER (FIN) is Standard-legal mythic.
// - commander_lookup: Atraxa, Praetors' Voice has 41,638 EDHREC decks;
//   inclusion rates — Doubling Season 32%, Brokers Ascendancy 33%,
//   Tamiyo, Field Researcher 27%.
import type { DemoMessage } from "$lib/components/marketing/types";

export const withoutStandard: DemoMessage[] = [
  { role: "player", text: "Should I craft Sheoldred for my mono-black deck?" },
  {
    role: "ai",
    text: "Sheoldred, the Apocalypse is a strong card in Standard. At 2BB, she punishes your opponent's draws and gains you life on yours. Definitely worth crafting for mono-black.",
  },
];

export const withStandard: DemoMessage[] = [
  { role: "player", text: "Should I craft Sheoldred for my mono-black deck?" },
  {
    role: "ai",
    text: "Don't -- Sheoldred rotated out of Standard in 2025, so she's not legal in your format. The drain engine in current mono-black lists is Sephiroth, Fabled SOLDIER: he drains every time one of your creatures dies, and the fourth one flips him. You're missing 2 copies, that's 2 mythic wildcards. You have 4 in the bank.",
  },
];

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
