import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Satisfactory landing page content -- .sav parsing plus seven planning
 * modules from the game's shipped data. Demo numbers are verbatim from
 * the production-planner view fixtures: a Thermal Propulsion Rocket at
 * 1/min takes 169 machines, 1,911.53 MW, and 10 raw inputs.
 */
export const content: GamePageContent = {
  seo: {
    title: "Satisfactory with Claude & ChatGPT -- Production Plans From Real Data | Savecraft",
    metaDescription:
      "Savecraft parses your Satisfactory saves and gives Claude and ChatGPT real production planning -- machine counts per tier, power sizing, milestone costs, alternate recipe verdicts -- from the game's own shipped data.",
    ogTitle: "Savecraft -- Satisfactory Plans From the Game's Own Data",
    ogDescription:
      "Full production chains with machine counts and power draw, milestone costs, Space Elevator phases, alternate-recipe verdicts -- plus your actual factory parsed from the save.",
    jsonDescription:
      "Savecraft parses Satisfactory saves and grounds Claude and ChatGPT in production plans from the game's own shipped data.",
    path: "/satisfactory",
  },
  gameName: "Satisfactory",
  theme: {
    accent: "#e89a3c",
    accentBright: "#f5b968",
    onAccent: "#1a0f04",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(150, 90, 20, 0.38) 0%, transparent 52%), radial-gradient(ellipse at 78% 45%, rgba(50, 70, 100, 0.32) 0%, transparent 50%), linear-gradient(180deg, #0a0603 0%, #121008 28%, #0e1424 60%, #0a0e2e 100%)",
    particleSeed: 447,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "FICSIT-GRADE PLANNING IN CHAT",
    title: "Satisfactory factories, planned in Claude.",
    subtitle:
      "Ask for any item at any rate and get the full dependency tree -- machine counts per tier, power draw, raw inputs -- computed from the game's own shipped data. Your saves parse in too. Works with Claude and ChatGPT.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/satisfactory/productionplanner-deep-endgame-plan.webp",
        width: 2200,
        height: 1600,
        alt: "Production plan for a Thermal Propulsion Rocket per minute -- 169 machines, 1,911.53 MW of power, 10 raw inputs, machine counts broken down per recipe from Iron Rod constructors to Modular Engine manufacturers",
      },
      {
        src: "/images/satisfactory/productionplanner-save-aware-plan.webp",
        width: 2200,
        height: 1064,
        alt: "Save-aware production plan comparing the target chain against machines that already exist in the player's factory",
      },
      {
        src: "/images/satisfactory/productionplanner-small-plan.webp",
        width: 1320,
        height: 882,
        alt: "A compact production plan with per-recipe machine counts and power totals from the game's shipped recipe data",
      },
    ],
    primaryCta: { label: "ADD SATISFACTORY" },
    secondaryCta: { label: "SEE THE PLANNERS", href: "#tools" },
  },
  proofItems: [
    "The game's own shipped data files",
    "Seven planners -- chains, power, milestones, tiers",
    "Your factory, parsed from the .sav",
    "Alpha -- game versions 1.0-1.2",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "SAVE-POWERED",
      title: "Your factory, out of the .sav.",
      subtitle:
        "The Savecraft daemon parses your saves locally -- machines, production, power, storage, trains, progression -- and pushes structured state, never the file.",
      treatment: "tinted",
      items: [
        {
          source: "What comes out",
          desc: "Factory machines with measured production rates, power grids, storage contents, trains, and milestone progression -- the state of your actual factory, readable by your AI.",
        },
        {
          source: "Version window, honestly",
          desc: "This is an early (alpha) release supporting game versions 1.0 through 1.2 (save versions 46-60). Newer game versions are rejected until their save format is verified -- a loud no instead of silently wrong numbers.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "SEVEN PLANNERS",
      title: "The spreadsheet, retired.",
      subtitle:
        "Recipes, chains, milestones, power, Space Elevator phases, alternate-recipe verdicts, building stats -- all from the game's shipped data.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "PRODUCTION PLAN -- FULL DEPENDENCY TREE",
          without: [
            {
              role: "player",
              text: "What does one Thermal Propulsion Rocket per minute actually take?",
            },
            {
              role: "ai",
              text: "Quite a lot! You'll need a good aluminum setup, plenty of turbo motors, and a strong power grid -- probably a few hundred megawatts. Plan for a large factory floor and work backwards from the components.",
            },
          ],
          withoutCaption: "\"Probably a few hundred megawatts\" is off by more than a gigawatt.",
          with: [
            {
              role: "player",
              text: "What does one Thermal Propulsion Rocket per minute actually take?",
            },
            {
              role: "ai",
              text: "169 machines, 1,911.53 MW, ten raw inputs. The tree bottoms out at 25 Iron Rod constructors and 22 for Screws, with 17 smelters on Iron Ingots -- and Modular Engines alone want three Manufacturers pulling 137.5 MW. Want it staged by tier so you can build it in passes?",
            },
          ],
          withCaption: "The production planner, computed from the game's own recipe data.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "A planning department on call",
      subtitle: "Chains, milestones, and power -- with your actual factory as context.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "CHAIN PLANNER",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "Stage that rocket plan by tier so I can build it in passes.",
            },
            {
              role: "ai",
              text: "The planner already breaks machine counts per recipe and building type -- smelters first, then constructors, assemblers, manufacturers. Each pass gets its own power subtotal, so your grid grows with the build instead of browning out at the end.",
            },
          ],
        },
        {
          icon: "=",
          label: "MILESTONE GUIDE",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "What does the next Space Elevator phase actually need?",
            },
            {
              role: "ai",
              text: "The Space Elevator module carries the exact parts and quantities for all five Project Assembly phases -- verified against the game's cooked assets, not a wiki table that lags a patch behind.",
            },
          ],
        },
        {
          icon: "+",
          label: "ALT-RECIPE JUDGE",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "Is this hard drive recipe worth taking?",
            },
            {
              role: "ai",
              text: "The hard-drive module ranks alternate recipes by what they save you -- machines, power, and raw inputs versus the default chain. Some alternates are traps; the numbers say which ones before you burn the unlock.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO BLUEPRINT",
      title: "Three steps to an efficient factory.",
      subtitle: "The daemon parses; the planners compute; you build.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Satisfactory",
          desc: "Install the Savecraft daemon and point it at your save folder. Saves parse locally on change.",
        },
        {
          title: "Play. Save. Done.",
          desc: "Machines, rates, power, storage, trains, and progression come out structured -- no manual exports.",
        },
        {
          title: "Plan out loud",
          desc: "\"What does X per minute take?\" gets the full tree with machine counts and megawatts, staged however you want to build it.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Shipped game data, asset-verified where it matters.",
      treatment: "plain",
      items: [
        {
          source: "The game's data files",
          desc: "Recipes, buildings, milestones, and tiers come from Satisfactory's own shipped data -- machine counts and power draw match what the in-game tooltips would tell you, per version.",
        },
        {
          source: "Cooked-asset verification",
          desc: "Some numbers the docs omit -- Space Elevator phase costs among them -- are extracted from the game's cooked assets directly, so the answer matches the build screen, not a stale wiki.",
        },
        {
          source: "Honest edges",
          desc: "Alpha release. Game versions 1.0-1.2 only for now; newer save formats are rejected loudly rather than parsed wrong. Machine status in your save is inferred from measured rates and inventories.",
        },
      ],
    },
  ],
  cta: {
    title: "The factory grows. Efficiently, this time.",
    sub: "Works with Claude and ChatGPT. Add Satisfactory and plan your next build in plain language.",
    label: "ADD SATISFACTORY",
  },
};
