import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Diablo II: Resurrected landing page content -- deep .d2s/.d2i parsing
 * for Reign of the Warlock (v105) plus the drop calculator. All demo
 * numbers come verbatim from the hero captures: Atmus the Level 75
 * Warlock (d2r1.jpeg) and the Skin of the Vipermagi drop table at 81%
 * Magic Find (d2r2.jpeg).
 */
export const content: GamePageContent = {
  seo: {
    title: "Diablo II: Resurrected with Claude & ChatGPT -- Reign of the Warlock | Savecraft",
    metaDescription:
      "Savecraft parses your Diablo II: Resurrected saves for the Reign of the Warlock (v105) mod -- characters, gear, skills, mercs, shared stash -- so Claude and ChatGPT can read your actual build. Plus a drop calculator with real odds at your Magic Find.",
    ogTitle: "Savecraft -- Your D2R Characters, Read by Your AI",
    ogDescription:
      "Reign of the Warlock (v105) save parsing -- characters, gear, skills, mercs, shared stash -- plus a drop calculator with real odds at your Magic Find.",
    jsonDescription:
      "Savecraft parses Reign of the Warlock (v105) saves so Claude and ChatGPT can read your actual D2R characters, with a real drop calculator.",
    path: "/d2r",
  },
  gameName: "Diablo II: Resurrected",
  theme: {
    accent: "#c94f3d",
    accentBright: "#e87a5e",
    onAccent: "#1a0703",
    heroBackground:
      "radial-gradient(ellipse at 25% 12%, rgba(140, 30, 15, 0.42) 0%, transparent 52%), radial-gradient(ellipse at 75% 50%, rgba(90, 60, 15, 0.3) 0%, transparent 50%), linear-gradient(180deg, #0c0302 0%, #150705 28%, #120c1e 60%, #0a0e2e 100%)",
    particleSeed: 313,
    heroAccent: "crimson",
  },
  hero: {
    eyebrow: "REIGN OF THE WARLOCK, PARSED",
    title: "Your D2R characters, read by Claude.",
    subtitle:
      "Savecraft parses Reign of the Warlock (v105) saves in place -- every character's gear, skills, attributes, merc, and the shared stash. The drop calculator answers with real odds at your Magic Find. Works with Claude and ChatGPT.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/d2r/d2r2.jpeg",
        width: 1614,
        height: 1368,
        alt: "Drop calculator for Skin of the Vipermagi at 81% Magic Find -- 5,228 sources ranked by chance, Uber Diablo in Nightmare at 1:101, Mephisto Hell quest drops at 1:579",
      },
      {
        src: "/images/d2r/d2r1.jpeg",
        width: 1592,
        height: 942,
        alt: "Claude reading Atmus, a Level 75 Warlock in Hell difficulty Act 2 -- the character card parsed straight from the .d2s save",
      },
      {
        src: "/images/d2r/dropcalc-monster-drops.webp",
        width: 1586,
        height: 1148,
        alt: "Drop calculator view showing a monster's drop table with Magic Find applied -- odds per item computed from treasure classes",
      },
    ],
    primaryCta: { label: "ADD DIABLO II" },
    secondaryCta: { label: "SEE THE DROP CALC", href: "#tools" },
  },
  proofItems: [
    "Reign of the Warlock (v105) saves",
    "Full .d2s parsing -- gear, skills, mercs, corpse",
    "Shared stash (.d2i) included",
    "Drop odds at your actual Magic Find",
    "Beta release",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "SAVE-POWERED",
      title: "The whole character, out of the save.",
      subtitle:
        "The Savecraft daemon watches your save folder and parses every .d2s in place -- the file never leaves your machine, only the parsed state does.",
      treatment: "tinted",
      items: [
        {
          source: "What gets parsed",
          desc: "Everything in the save: equipped gear with full property formatting -- skill names, charges, chance-to-cast, per-level scaling -- plus skill trees, attributes, mercenary loadouts, your corpse if you left one somewhere expensive, and the shared stash.",
        },
        {
          source: "One version, done well",
          desc: "Reign of the Warlock (v105) -- the Diablo II: Resurrected mod that adds the Warlock class -- and only that. Vanilla D2R and classic Lord of Destruction saves aren't the target. That focus is why a modded class parses correctly instead of breaking the reader.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "THE DROP CALCULATOR",
      title: "Real odds, not wiki folklore.",
      subtitle:
        "Drop probabilities computed from treasure classes -- any item, any farmable source, adjusted for your Magic Find and player count.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "DROP ODDS -- REAL TREASURE-CLASS MATH",
          without: [
            {
              role: "player",
              text: "Where should I farm for a Skin of the Vipermagi?",
            },
            {
              role: "ai",
              text: "Skin of the Vipermagi drops from most Act bosses. Mephisto runs are usually your best bet -- he has a high drop rate for mid-level uniques. Just do a few hundred runs and it should show up!",
            },
          ],
          withoutCaption: '"A few hundred runs" is not a number. Neither is "usually."',
          with: [
            {
              role: "player",
              text: "Where should I farm for a Skin of the Vipermagi, given my MF?",
            },
            {
              role: "ai",
              text: "At your 81% Magic Find there are 5,228 sources, and the honest answer is Uber Diablo in Nightmare -- his table sits at 1:101, the best source on the board. If you're just running bosses, Baal in Normal is your best at 1:444, and for Mephisto it's 1:476 in Nightmare versus 1:579 in Hell -- Nightmare Meph genuinely beats Hell Meph for this one.",
            },
          ],
          withCaption: "The drop calculator, computed at your character's actual Magic Find.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "A stash-side companion",
      subtitle: "Build reads from your save, farm plans from the treasure classes.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "CHARACTER SHEET",
          color: "var(--color-red)",
          examples: [
            {
              role: "player",
              text: "How is my Warlock in D2R looking?",
            },
            {
              role: "ai",
              text: "Atmus, Level 75 Warlock, Act 2 Hell -- pulled his equipment, skills, attributes, and merc from the save. Want the honest read on where the build is soft before you push deeper into Hell?",
            },
          ],
        },
        {
          icon: "=",
          label: "FARM PLANNER",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "What's actually worth farming at my Magic Find?",
            },
            {
              role: "ai",
              text: "The calculator ranks every farmable source for the item you want, with your MF applied -- so the answer changes when your gear does. Odds like 1:101 versus 1:579 are the difference between a weekend and a season.",
            },
          ],
        },
        {
          icon: "+",
          label: "STASH AUDITOR",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Do I already have a decent runeword base in the shared stash?",
            },
            {
              role: "ai",
              text: "The shared stash parses along with your characters, so I can see what's in the tabs -- bases, socket counts, and the pieces you forgot you saved. Ask before you go farm something you already own.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO ANSWERS",
      title: "Three steps, no copy-paste.",
      subtitle: "The daemon reads saves where they live. You just play.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Diablo II",
          desc: "Install the Savecraft daemon on the machine you play on and point it at your save folder.",
        },
        {
          title: "Save and exit like always",
          desc: "Every .d2s and the shared .d2i parse locally on change -- characters, gear, skills, mercs, stash.",
        },
        {
          title: "Ask about your build",
          desc: "Character reads, farm plans at your MF, stash checks -- grounded in what's actually in the save.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Binary-accurate parsing, treasure-class math.",
      treatment: "plain",
      items: [
        {
          source: "The save format itself",
          desc: "The parser reads the .d2s binary format directly -- bit-level item decoding, Huffman-coded properties, the works -- and formats properties the way the game does: skill names, charges, chance-to-cast, per-level scaling.",
        },
        {
          source: "Treasure classes",
          desc: "Drop odds are computed from the same treasure-class tables the game rolls from, adjusted for Magic Find and player count -- not a wiki's rounded guess.",
        },
        {
          source: "Scope, honestly",
          desc: "Reign of the Warlock (v105) only, and the whole integration is beta. Classic Lord of Destruction saves aren't supported, and that's a deliberate trade: one format, parsed deeply and correctly.",
        },
      ],
    },
  ],
  cta: {
    title: "Stay awhile and listen to your save.",
    sub: "Works with Claude and ChatGPT. Add Diablo II and your characters read out.",
    label: "ADD DIABLO II",
  },
};
