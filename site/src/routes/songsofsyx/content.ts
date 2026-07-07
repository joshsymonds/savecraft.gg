import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Songs of Syx landing page content -- reference-first: five modules
 * generated verbatim from the game's shipped data and in-game guide.
 * The live-colony mod is NOT shipped yet and is framed strictly as
 * roadmap. Demo facts are verbatim from the generated data tables
 * (races_gen.go: Cretonian description + preferred foods; rooms_gen.go:
 * 112 rooms).
 */
export const content: GamePageContent = {
  seo: {
    title: "Songs of Syx with Claude & ChatGPT -- The Game's Own Guide, Queryable | Savecraft",
    metaDescription:
      "Savecraft gives Claude and ChatGPT Songs of Syx's own shipped data -- the in-game guide, all 112 rooms, races, resources, and the knowledge tree -- quoted verbatim, not paraphrased from a wiki.",
    ogTitle: "Savecraft -- Songs of Syx, In the Game's Own Words",
    ogDescription:
      "The in-game guide, rooms, races, resources, and tech tree -- generated verbatim from the game's shipped data and queryable in chat.",
    jsonDescription:
      "Savecraft grounds Claude and ChatGPT in Songs of Syx's own shipped data: guide, rooms, races, resources, and tech.",
    path: "/songsofsyx",
  },
  gameName: "Songs of Syx",
  theme: {
    accent: "#d8a25e",
    accentBright: "#f0c184",
    onAccent: "#1a1004",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(140, 95, 35, 0.38) 0%, transparent 52%), radial-gradient(ellipse at 78% 45%, rgba(90, 50, 30, 0.3) 0%, transparent 50%), linear-gradient(180deg, #0b0703 0%, #140e06 28%, #10101e 60%, #0a0e2e 100%)",
    particleSeed: 271,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "THE GAME'S OWN WORDS, QUERYABLE",
    title: "Songs of Syx, explained in Claude.",
    subtitle:
      "A 4X colony sim this deep deserves better than guesses. Savecraft ships the game's own guide, rooms, races, resources, and knowledge tree -- generated verbatim from the shipped data files. Works with Claude and ChatGPT.",
    demo: {
      headerLabel: "RACE CHECK -- THE GAME'S OWN NOTES",
      conversation: [
        {
          role: "player",
          text: "Can I feed my Cretonians meat, or is that a problem?",
        },
        {
          role: "ai",
          text: "It's a problem -- the game's own race notes say Cretonians are vegetarians who 'excel at farming and thrive in temperate and warm climates.' Their preferred foods are vegetables, bread, and fruit. Plant accordingly; keep the meat for your Dondorians.",
        },
      ],
    },
    primaryCta: { label: "ADD SONGS OF SYX" },
    secondaryCta: { label: "SEE THE MODULES", href: "#tools" },
  },
  proofItems: [
    "The in-game guide, verbatim",
    "112 rooms with the game's own descriptions",
    "Races, resources, knowledge tree",
    "Alpha -- reference today, live colony on the roadmap",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "REFERENCE-FIRST",
      title: "The manual the game already wrote.",
      subtitle:
        "Songs of Syx ships with a dev-written guide most players never finish reading. Savecraft makes all of it -- plus the underlying data -- queryable in plain language.",
      treatment: "tinted",
      items: [
        {
          source: "Generated, not paraphrased",
          desc: "Every module is generated verbatim from the game's shipped data files and in-game guide text for a specific game version. When your AI quotes a mechanic, it's quoting the developer -- not a wiki, not a hunch.",
        },
        {
          source: "Live colony state: roadmap",
          desc: "This is an early (alpha) release and reference-only for now -- the in-game mod that will push your live colony state is not yet shipped. When it lands, this page will say so; until then, no pretending. Modded game content isn't included either.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "FIVE MODULES",
      title: "Mechanics, rooms, races, resources, tech.",
      subtitle:
        "The guide explains how systems work; the lookups carry the exact stats underneath them.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "MECHANICS -- FROM THE SHIPPED GUIDE",
          without: [
            {
              role: "player",
              text: "How does happiness work in Songs of Syx?",
            },
            {
              role: "ai",
              text: "Like most colony sims, happiness comes from meeting needs -- food variety, housing quality, and entertainment. Keep everyone fed and sheltered and build some taverns; it works similarly to RimWorld's mood system.",
            },
          ],
          withoutCaption: "\"Similar to RimWorld\" is how every wrong Songs of Syx answer starts.",
          with: [
            {
              role: "player",
              text: "How does happiness work in Songs of Syx?",
            },
            {
              role: "ai",
              text: "Let me quote the game's own guide rather than analogize -- Songs of Syx has its own systems, and the dev's notes on happiness, fulfillment, and loyalty explain how they interact at population scale. Here's the relevant guide entry, verbatim, and the room stats that feed it.",
            },
          ],
          withCaption: "The guide module returns the developer's text, keyed by topic.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "A vizier who read the manual",
      subtitle: "Race plans, room stats, and tech routes from the game's own data.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "RACE ADVISOR",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "Which races actually work together in one city?",
            },
            {
              role: "ai",
              text: "Each race entry carries the dev's own description -- who farms, who mines, who fights -- plus preferred foods, growth timings, and whether they're playable. Cretonians farm and want harmony; Dondorians mine and don't care for fields. Plan districts around that, not around vibes.",
            },
          ],
        },
        {
          icon: "=",
          label: "ROOM PLANNER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "What does a bakery actually need to run?",
            },
            {
              role: "ai",
              text: "All 112 rooms are in the lookup with base-tier stats and the game's own description -- what a room produces, what it consumes, and who works it. Ask about any building before you flatten a district for it.",
            },
          ],
        },
        {
          icon: "+",
          label: "TECH PLANNER",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "What's the cheapest route to better farming tech?",
            },
            {
              role: "ai",
              text: "The knowledge tree module carries each tech's knowledge-point cost, its prerequisites, and the population threshold that gates it -- so the route accounts for how big your city needs to be, not just what to click next.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM QUESTION TO SOURCE",
      title: "Add the game. Ask away.",
      subtitle: "Reference modules need zero setup -- no saves, no mods, no files.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Songs of Syx",
          desc: "All five modules come online the moment the game is added to your Savecraft account.",
        },
        {
          title: "Ask about any system",
          desc: "Mechanics, rooms, races, resources, tech -- answers quote the game's own data and guide text.",
        },
        {
          title: "Live colony: coming",
          desc: "The in-game mod that pushes your actual colony is on the roadmap. Until it ships, this page won't claim it does.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "One source: the game itself.",
      treatment: "plain",
      items: [
        {
          source: "The shipped data files",
          desc: "Rooms, races, resources, and the knowledge tree are generated from the game's own data for a single game version -- stats and descriptions verbatim, regenerated when the version bumps.",
        },
        {
          source: "The in-game guide",
          desc: "The developer's own GUIDE text ships with the game; Savecraft keys it by topic so your AI can quote the actual explanation instead of improvising one from other colony sims.",
        },
        {
          source: "Scope, honestly",
          desc: "Alpha, reference-only, vanilla content for a single game version. The live-colony mod is on the roadmap -- it isn't here yet, and nothing on this page pretends otherwise.",
        },
      ],
    },
  ],
  cta: {
    title: "Rule your thousands, informed.",
    sub: "Works with Claude and ChatGPT. Add Songs of Syx and the game's own manual answers.",
    label: "ADD SONGS OF SYX",
  },
};
