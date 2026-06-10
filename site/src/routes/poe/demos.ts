// Before/after demo conversation for the /poe landing page.
//
// Facts verified 2026-06-10 against Savecraft's own modules:
// - gem_search: Awakened Added Cold Damage and Added Cold Damage both exist;
//   the awakened version grants +1 to supported cold gems at high level.
// - passive_tree: Heart of Ice is a tree notable (30% increased Cold Damage,
//   6% cold penetration) — NOT a cluster jewel, so it costs points, not div.
// - The 40 div price is the player's own trade observation, not our claim
//   (economy has no Awakened Added Cold listings in the current league).
// DPS figures are illustrative PoB output for the hypothetical build.
import type { DemoMessage } from "$lib/components/marketing/types";

export const withoutPoB: DemoMessage[] = [
  {
    role: "player",
    text: "Awakened Added Cold is 40 div on trade. Worth it over the L21 Added Cold in my main link?",
  },
  {
    role: "ai",
    text: "Awakened Added Cold Support gives roughly +12% More Cold Damage over the regular version, plus it levels to 5. Probably worth it if you're min-maxing, though 40 divines is a lot.",
  },
];

export const withPoB: DemoMessage[] = [
  {
    role: "player",
    text: "Awakened Added Cold is 40 div on trade. Worth it over the L21 Added Cold in my main link?",
  },
  {
    role: "ai",
    text: "Tested both on your pobb.in. Added Cold L21: 3.8M DPS. Awakened Added: 4.4M DPS (+15.8%). Worth it if you're min-maxing. Check the tree first though: Heart of Ice is three points away for +8% of that, no divines spent.",
  },
];
