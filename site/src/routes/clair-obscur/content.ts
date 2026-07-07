import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Clair Obscur: Expedition 33 landing page content -- pure save-state
 * page (no reference modules). Section claims come verbatim from
 * docs/games.md: overview (playtime, NG+ cycle, location, gold,
 * difficulty, roster), per-character sections (level, XP, HP/MP/AP,
 * base stats, equipped skills, gear, Lumina allocations), party,
 * inventory, progression, weapons. The undocumented-formulas limitation
 * is the honesty pitch, not a footnote.
 */
export const content: GamePageContent = {
  seo: {
    title: "Clair Obscur: Expedition 33 with Claude & ChatGPT -- Your Builds, Read | Savecraft",
    metaDescription:
      "Savecraft parses Clair Obscur: Expedition 33 saves so Claude and ChatGPT can read your actual expedition -- character builds, Lumina allocations, party, progression -- without inventing damage formulas the game never published.",
    ogTitle: "Savecraft -- Expedition 33, Read From the Save",
    ogDescription:
      "Character builds, Lumina allocations, party, and progression parsed from your save. No invented formulas -- the game never published them, so we don't guess.",
    jsonDescription:
      "Savecraft parses Clair Obscur: Expedition 33 saves so Claude and ChatGPT can read your actual builds and progression.",
    path: "/clair-obscur",
  },
  gameName: "Clair Obscur: Expedition 33",
  theme: {
    accent: "#c9b47f",
    accentBright: "#e8d5a3",
    onAccent: "#171204",
    heroBackground:
      "radial-gradient(ellipse at 25% 12%, rgba(120, 110, 90, 0.32) 0%, transparent 52%), radial-gradient(ellipse at 75% 45%, rgba(60, 60, 70, 0.35) 0%, transparent 50%), linear-gradient(180deg, #060605 0%, #100f0d 28%, #0e1020 60%, #0a0e2e 100%)",
    particleSeed: 33,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "FOR THOSE WHO COME AFTER",
    title: "Expedition 33, read by Claude.",
    subtitle:
      "Savecraft parses Clair Obscur: Expedition 33 saves in place -- every character's build, skills, gear, and Lumina allocations, plus party, inventory, and story progression. Works with Claude and ChatGPT.",
    demo: {
      headerLabel: "BUILD CHECK -- FROM YOUR SAVE",
      conversation: [
        {
          role: "player",
          text: "What does my Maelle build actually look like right now?",
        },
        {
          role: "ai",
          text: "Reading her from your save: level, stats, equipped skills, weapon, and every Lumina you've allocated -- the build as it exists, not as either of us remembers it. Want me to compare her loadout against the rest of the roster before you push the next act?",
        },
      ],
    },
    primaryCta: { label: "ADD EXPEDITION 33" },
    secondaryCta: { label: "SEE WHAT IT READS", href: "#reads" },
  },
  proofItems: [
    "Full save parsing -- builds, party, progression",
    "Lumina allocations, per character",
    "Unreal Engine save format, decoded locally",
    "Alpha -- no invented damage formulas",
  ],
  sections: [
    {
      kind: "methodGrid",
      id: "reads",
      eyebrow: "SAVE-POWERED",
      title: "The whole expedition, out of the save.",
      subtitle:
        "The Savecraft daemon decodes the game's Unreal Engine save format locally -- the file never leaves your machine, only the parsed state does.",
      treatment: "tinted",
      items: [
        {
          source: "What gets parsed",
          desc: "An expedition overview -- playtime, New Game+ cycle, current location, gold, difficulty, and the character roster -- plus a full section per character: level, experience, HP/MP/AP, base stats, equipped skills, gear, and Lumina allocations. Party composition, inventory, story progression, and weapons round it out.",
        },
        {
          source: "What we refuse to guess",
          desc: "This game's damage formulas aren't publicly documented, so Savecraft doesn't pretend to know them -- no invented crit math, no fabricated scaling curves. This is an early (alpha) release, and inventory items aren't categorized by type yet (the save data carries no type tags).",
        },
      ],
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "BUILD ADVICE -- WITHOUT THE FICTION",
          without: [
            {
              role: "player",
              text: "Should I stack crit on Maelle or go for raw power?",
            },
            {
              role: "ai",
              text: "Crit is usually the play -- critical hits in Expedition 33 deal 2.5x base damage, and with the right Pictos you can push crit chance past 60%, which out-scales flat power increases by the midgame.",
            },
          ],
          withoutCaption:
            "That 2.5x -- and the 60% -- are invented. The game never published its formulas; neither should your AI.",
          with: [
            {
              role: "player",
              text: "Should I stack crit on Maelle or go for raw power?",
            },
            {
              role: "ai",
              text: "Honest framing first: this game's damage formulas aren't public, so I won't invent multipliers. What I can do is read her actual build -- stats, skills, weapon, and every Lumina you've allocated -- and reason about how those pieces fit together, clearly labeled as my reasoning rather than looked-up fact.",
            },
          ],
          withCaption: "Your real build plus honest reasoning beats confident fiction.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "An expedition journal that reads itself",
      subtitle: "Builds, party, and progression -- from the save, not from memory.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "BUILD READER",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "Which of my characters is under-leveled for where I am?",
            },
            {
              role: "ai",
              text: "The roster comes with levels in the overview, and each character's section carries their full sheet. Cross-referencing that against your current location and act is exactly the kind of question the save answers cleanly.",
            },
          ],
        },
        {
          icon: "=",
          label: "LOADOUT AUDITOR",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Did I ever re-equip those skills after the last boss?",
            },
            {
              role: "ai",
              text: "Equipped skills and gear parse per character, so 'what is actually equipped right now' has a definitive answer -- including the Lumina allocations you set three sessions ago and forgot about.",
            },
          ],
        },
        {
          icon: "+",
          label: "EXPEDITION LOG",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "How far am I, really? And is this NG+ worth continuing?",
            },
            {
              role: "ai",
              text: "Playtime, story progression, New Game+ cycle, gold, and difficulty all sit in the overview -- an honest picture of the run you're on, before you decide whether the next one starts tonight.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO ANSWERS",
      title: "Three steps into the expedition.",
      subtitle: "The daemon watches; the parser decodes; you ask.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Expedition 33",
          desc: "Install the Savecraft daemon on the machine you play on and point it at your save folder.",
        },
        {
          title: "Save like you always do",
          desc: "Each save decodes locally -- Unreal Engine's binary format in, structured expedition state out.",
        },
        {
          title: "Ask about the run",
          desc: "Builds, loadouts, party, progression -- grounded in what the save actually says.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Binary-accurate parsing, honest limits.",
      treatment: "plain",
      items: [
        {
          source: "The save format itself",
          desc: "The parser decodes Unreal Engine 5's GVAS save format directly -- property tags, nested structures, arrays -- with safety limits against malformed data. What's in the save is what you get.",
        },
        {
          source: "No invented formulas",
          desc: "Clair Obscur's combat math isn't publicly documented. Rather than dress up guesses as facts, Savecraft reads what's knowable -- your build -- and leaves formula speculation clearly labeled as speculation.",
        },
        {
          source: "Honest edges",
          desc: "Alpha release. Inventory items aren't categorized by type -- the save data carries no type tags to categorize by. When the edges move, this page moves with them.",
        },
      ],
    },
  ],
  cta: {
    title: "When one falls, we continue.",
    sub: "Works with Claude and ChatGPT. Add Expedition 33 and your save speaks for itself.",
    label: "ADD EXPEDITION 33",
  },
};
