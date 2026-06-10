// The Magic Standard-rotation before/after demo, shared by the home page
// and /magic so the facts live in exactly one place.
//
// Facts verified 2026-06-10 against Savecraft's own modules: Sheoldred
// (DMU) rotated out of Standard July 2025; Sephiroth, Fabled SOLDIER (FIN)
// is a Standard-legal mythic played in current mono-black lists.
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

export const standardCaptions = {
  without: "Sheoldred rotated out of Standard in 2025. Stale training data.",
  with: "Current Standard legality. Your wildcards counted.",
};

export const standardHeaderLabel = "STANDARD -- MONO-BLACK WILDCARDS";
