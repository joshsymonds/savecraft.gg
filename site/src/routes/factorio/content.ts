import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Factorio landing page content -- the Savecraft Export mod pushes
 * factory state on every save, and eleven calculators answer from the
 * game's own data. Demo numbers are verbatim from the hero captures:
 * the Artillery tech-path conversation (factorio2.jpg) and the
 * bottlenecked-factory diagnosis fixture
 * (views-productionflow-bottlenecked-factory.png).
 */
export const content: GamePageContent = {
  seo: {
    title: "Factorio with Claude & ChatGPT -- Factory Diagnosis & Ratios | Savecraft",
    metaDescription:
      "Savecraft's Export mod gives Claude and ChatGPT your live factory -- production rates, power, science -- plus eleven calculators: ratios, oil, trains, quality, and a factory health diagnosis run on your own save.",
    ogTitle: "Savecraft -- Your Factorio Factory, Diagnosed by Your AI",
    ogDescription:
      "Your factory's real rates plus eleven calculators from the game's own data: ratios, oil, power, trains, quality. The factory doctor is in.",
    jsonDescription:
      "Savecraft's Export mod gives Claude and ChatGPT your live Factorio factory, plus eleven calculators from the game's own data.",
    path: "/factorio",
  },
  gameName: "Factorio",
  theme: {
    accent: "#e8823c",
    accentBright: "#f5a45e",
    onAccent: "#1a0c04",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(150, 70, 20, 0.4) 0%, transparent 52%), radial-gradient(ellipse at 78% 48%, rgba(80, 40, 15, 0.32) 0%, transparent 50%), linear-gradient(180deg, #0c0502 0%, #160b04 28%, #101020 60%, #0a0e2e 100%)",
    particleSeed: 172,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "THE FACTORY, DIAGNOSED IN CHAT",
    title: "Your Factorio factory, diagnosed in Claude.",
    subtitle:
      "The Savecraft Export mod pushes your factory on every save -- production rates, power, science. Eleven calculators answer from the game's own data, and the factory doctor reads your actual numbers. Works with Claude and ChatGPT.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/factorio/factorio2.jpg",
        width: 1630,
        height: 1444,
        alt: "Claude walking the research path to Artillery -- 7 technologies remaining, 12h 30m of research time, 172 already completed, with Vulcanus-tagged prerequisites listed in order",
      },
      {
        src: "/images/factorio/views-productionflow-bottlenecked-factory.webp",
        width: 1602,
        height: 1600,
        alt: "Factory health diagnosis showing Factory Stalled -- 5 critical bottlenecks, steel plate producing 38/min against 1,175/min consumed, copper cable needing one more Assembling Machine 3",
      },
      {
        src: "/images/factorio/views-ratiocalculator-electronic-circuit.webp",
        width: 2200,
        height: 1236,
        alt: "Production ratio calculator for electronic circuits -- machine counts by tier with belt requirements, computed from the game's recipe data",
      },
    ],
    primaryCta: { label: "ADD FACTORIO" },
    secondaryCta: { label: "SEE THE CALCULATORS", href: "#tools" },
  },
  proofItems: [
    "Savecraft Export mod on the Factorio mod portal",
    "Eleven calculators -- ratios, oil, power, trains, quality",
    "Factory health diagnosis from your own save",
    "Alpha -- vanilla recipe data",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "MOD-POWERED",
      title: "Install the mod. The factory reports in.",
      subtitle:
        "Factorio's saves aren't readable mid-session, so Savecraft ships an in-game mod: it exports structured factory state to script-output, and the local daemon pushes it on every save.",
      treatment: "tinted",
      items: [
        {
          source: "Install once",
          desc: "Grab the Savecraft Export mod from the Factorio mod portal and add it to your save. The Savecraft daemon watches script-output and does the rest -- no exports to run by hand.",
        },
        {
          source: "Where the edges are",
          desc: "This is an early (alpha) release. Reference calculators run on vanilla and official expansion data -- modded recipes and items aren't reflected yet. Your save's sections still capture modded state; the calculators answer for unmodded mechanics.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "ELEVEN CALCULATORS",
      title: "Ratios you don't have to alt-tab for.",
      subtitle:
        "Recipes, tech routes, ratios, oil, power, blueprints, evolution, modules, quality, trains -- computed from the game's own data files, so answers match the real recipes.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "FACTORY HEALTH -- REAL DIAGNOSIS",
          without: [
            {
              role: "player",
              text: "My factory feels slow. What's wrong with it?",
            },
            {
              role: "ai",
              text: "Common causes are belt throughput, inserter speed, or not enough assemblers. Check that your belts aren't backed up and consider upgrading to fast inserters. Adding more machines usually helps!",
            },
          ],
          withoutCaption: "A checklist of maybes. It has never seen your factory.",
          with: [
            {
              role: "player",
              text: "My factory feels slow. What's wrong with it?",
            },
            {
              role: "ai",
              text: "It's not slow, it's stalled -- 5 critical bottlenecks. Worst is steel: you're producing 38 a minute against 1,175 consumed, three percent of demand, and it's blocking engine units and low density structures. You have +1,960 iron plate a minute sitting surplus, so smelt it. Copper cable is quieter but real: 538 versus 540 -- one more Assembling Machine 3 clears it.",
            },
          ],
          withCaption: "The factory health module, run on your save's measured rates.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "An engineer on call",
      subtitle: "Diagnosis from your rates, routes from the tech tree, ratios from the recipes.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "FACTORY DOCTOR",
          color: "var(--color-red)",
          examples: [
            {
              role: "player",
              text: "What do I fix first?",
            },
            {
              role: "ai",
              text: "Steel. Producing at three percent of consumption blocks four downstream items -- and your iron surplus of +1,960 a minute means the fix is furnaces, not mining. The copper cable gap is one machine. Everything else is noise until those two are done.",
            },
          ],
        },
        {
          icon: "=",
          label: "SCIENCE PLANNER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "How far am I from Artillery?",
            },
            {
              role: "ai",
              text: "Seven technologies and about 12h 30m of research time at your current labs -- you've already completed 172. The path runs through calcite processing, tungsten carbide, and the foundry before artillery itself. Want the full ordered list with science pack costs?",
            },
          ],
        },
        {
          icon: "+",
          label: "POWER PLANNER",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "I need 100 more megawatts. Steam, solar, or nuclear?",
            },
            {
              role: "ai",
              text: "The power calculator sizes all three from the game's numbers -- boiler-to-engine ratios for steam, panel and accumulator counts for solar, reactor layouts for nuclear -- with fuel consumption per option so you can price the ongoing cost, not just the build.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO DIAGNOSIS",
      title: "Three steps to a factory that confesses.",
      subtitle: "The mod exports; the daemon pushes; the calculators do recipe math.",
      treatment: "tinted",
      steps: [
        {
          title: "Install mod + daemon",
          desc: "The Savecraft Export mod from the Factorio mod portal, plus the Savecraft daemon watching script-output. One-time setup.",
        },
        {
          title: "Play. Save. Done.",
          desc: "Every save exports production rates, power, science progress, evolution, and more -- structured, not screenshots.",
        },
        {
          title: "Ask the hard questions",
          desc: "\"What's my bottleneck?\" runs the diagnosis. Ratios, oil splits, train throughput, and quality odds come from the game's own data.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Your measured rates, the game's real recipes.",
      treatment: "plain",
      items: [
        {
          source: "Your save's measured rates",
          desc: "The diagnosis reads production and consumption rates the game itself recorded in your save -- not estimates, and never a guess about what your factory 'probably' looks like.",
        },
        {
          source: "The game's data files",
          desc: "Recipes, technologies, machine speeds, module effects, and quality math are generated from Factorio's own data, per game version. Ratio answers match what the assembler tooltip would tell you.",
        },
        {
          source: "Honest edges",
          desc: "Vanilla and official content only for now -- modded recipes aren't reflected. Modded factory state still surfaces in your save's sections. When this changes, this page changes.",
        },
      ],
    },
  ],
  cta: {
    title: "The factory must grow.",
    sub: "Works with Claude and ChatGPT. Install the mod and your next save gets diagnosed.",
    label: "ADD FACTORIO",
  },
};
