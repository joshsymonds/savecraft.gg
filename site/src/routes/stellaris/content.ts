import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Stellaris landing page content -- the daemon parses .sav saves into
 * empire state, and ten reference modules search the game's own data.
 * Every number in demo copy is verbatim from the hero captures /
 * module fixtures: the Devouring Swarm empire-health audit
 * (stellaris2.jpg), the Battleships tech path (stellaris1.jpg), and
 * the Prethoryn-crisis fixture (empirehealth-empire-in-crisis.png).
 */
export const content: GamePageContent = {
  seo: {
    title: "Stellaris with Claude & ChatGPT -- Empire Audits from Your Save | Savecraft",
    metaDescription:
      "Savecraft parses your Stellaris saves so Claude and ChatGPT can audit your actual empire -- economy runways, tech paths, military posture -- plus ten searchable modules built from the game's own data.",
    ogTitle: "Savecraft -- Your Stellaris Empire, Audited by Your AI",
    ogDescription:
      "Your save, parsed: economy runways, tech paths, military posture. Ten reference modules from the game's own data files. Works with Claude and ChatGPT.",
    jsonDescription:
      "Savecraft parses Stellaris saves so Claude and ChatGPT can audit your actual empire, with ten reference modules from the game's own data.",
    path: "/stellaris",
  },
  gameName: "Stellaris",
  theme: {
    accent: "#54bdb4",
    accentBright: "#7fe0d8",
    onAccent: "#03211e",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(20, 90, 85, 0.42) 0%, transparent 52%), radial-gradient(ellipse at 78% 45%, rgba(60, 30, 90, 0.3) 0%, transparent 50%), linear-gradient(180deg, #020608 0%, #041412 28%, #081226 60%, #0a0e2e 100%)",
    particleSeed: 66,
    heroAccent: "blue",
  },
  hero: {
    eyebrow: "YOUR EMPIRE, AUDITED",
    title: "Your Stellaris empire, briefed in Claude.",
    subtitle:
      "The Savecraft daemon parses your saves -- economy, technology, military, diplomacy -- and the empire health module turns them into an honest audit. Nine more modules search the game's own data. Works with Claude and ChatGPT.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/stellaris/stellaris2.jpg",
        width: 1614,
        height: 1512,
        alt: "Claude auditing a Devouring Swarm empire -- 22 critical findings, food burning 1,068.3 a month with a 43-month runway, alloys negative, energy and unity healthy",
      },
      {
        src: "/images/stellaris/stellaris1.jpg",
        width: 1736,
        height: 1518,
        alt: "Claude showing the technology path to Battleships -- 6,500 remaining research cost, with Destroyers and Cruisers as the main prerequisites",
      },
      {
        src: "/images/stellaris/empirehealth-empire-in-crisis.webp",
        width: 1328,
        height: 1600,
        alt: "Empire health view during an active Prethoryn Scourge crisis -- energy at 2 months of runway and an empty food stockpile flagged critical, alloys still buffered at 65 months",
      },
    ],
    primaryCta: { label: "ADD STELLARIS" },
    secondaryCta: { label: "SEE THE MODULES", href: "#tools" },
  },
  proofItems: [
    "Parses your actual .sav files",
    "Empire health audit from your own save",
    "Nine modules from the game's own data files",
    "Beta -- text saves today, ironman untested",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "SAVE-POWERED",
      title: "Your save, decoded.",
      subtitle:
        "Point the Savecraft daemon at your Stellaris save folder and every save parses into structured empire state -- no exports, no copy-paste.",
      treatment: "tinted",
      items: [
        {
          source: "What comes out",
          desc: "Empire overview, full economy with per-resource income and expenses, technology progress, fleets and military strength, diplomacy and wars, planets, and more -- the state behind the UI, readable by your AI.",
        },
        {
          source: "Where the edges are",
          desc: "Text-format saves today -- binary ironman saves are untested. Planet data is summary-level rather than full district breakdowns, and a few war and fleet names resolve as raw IDs. All of it improves; none of it is hidden.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "TEN MODULES",
      title: "The game's data, searchable.",
      subtitle:
        "Techs, ship components, traditions, civics, traits, edicts, jobs -- generated from the game's own files, so answers match your version. Empire health reads your save; the rest work instantly.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "EMPIRE HEALTH -- REAL AUDIT",
          without: [
            {
              role: "player",
              text: "How's my Devouring Swarm game going?",
            },
            {
              role: "ai",
              text: "Devouring Swarm is a strong aggressive archetype! Keep expanding, keep your alloy production up, and snowball with early conquests. You're probably doing great if you've been eating your neighbors.",
            },
          ],
          withoutCaption: "Cheerleading. It has no idea what your empire looks like.",
          with: [
            {
              role: "player",
              text: "How's my Devouring Swarm game going?",
            },
            {
              role: "ai",
              text: "22 critical findings. The big one is food: you're burning 1,068 a month, which sounds bad until you see the 43-month stockpile runway -- watch it, don't panic. Alloys are quietly negative at -192 a month with 148 months of buffer. Energy and unity are genuinely healthy: +1,453 and +4,530 a month. Fix the alloy drain first; it's the one that ends wars early.",
            },
          ],
          withCaption: "The empire health module, run on your actual save.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "A chief of staff for the galaxy",
      subtitle: "Audits, tech routes, and loadout lookups -- grounded in your save and the game's data.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "CRISIS TRIAGE",
          color: "var(--color-red)",
          examples: [
            {
              role: "player",
              text: "The Prethoryn are here and everything's on fire. What do I fix first?",
            },
            {
              role: "ai",
              text: "Energy. You have 423 in the bank, two months of runway, and ship maintenance is 312 of your monthly drain -- if energy hits zero your fleets debuff mid-crisis. Food is already empty at -62 a month; your pops are next. Alloys can wait: 1,840 stockpiled is 65 months of buffer.",
            },
          ],
        },
        {
          icon: "=",
          label: "TECH PLANNER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Show me the technology path to Battleships.",
            },
            {
              role: "ai",
              text: "Shorter than you'd think -- 6,500 research remaining across the chain, all Engineering, and Destroyers at 2,000 plus Cruisers at 4,000 are the big rocks. Space construction and both starbase techs you already have.",
            },
          ],
        },
        {
          icon: "+",
          label: "LOADOUT SCOUT",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "What counters shields -- and what do I have unlocked?",
            },
            {
              role: "ai",
              text: "The component search covers every weapon and utility by size and slot, straight from the game's files -- and your save says which ones you've researched. Ask about a specific hull and we can walk the options you've actually unlocked.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO BRIEFING",
      title: "Three steps to a briefed empire.",
      subtitle: "The daemon watches; the modules answer. You just play.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Stellaris",
          desc: "Install the Savecraft daemon and point it at your save folder -- it watches for new saves automatically.",
        },
        {
          title: "Save like you always do",
          desc: "Every save parses locally into structured empire state and pushes up. Autosaves count -- no ritual required.",
        },
        {
          title: "Ask for the briefing",
          desc: "\"How am I doing?\" runs the empire health audit. Tech routes, component options, civic ideas -- all grounded in your version's data.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Parsed from your save, generated from the game's files.",
      treatment: "plain",
      items: [
        {
          source: "Your save, parsed",
          desc: "The daemon reads Stellaris's own save format locally -- the file never leaves your machine, only the parsed state does. Economy numbers are the game's numbers, not estimates.",
        },
        {
          source: "The game's data files",
          desc: "Tech trees, components, traditions, civics, traits, edicts, and jobs are generated from the game's shipped data for a specific version -- searchable, with costs and prerequisites intact.",
        },
        {
          source: "Honest edges",
          desc: "Ironman (binary) saves are untested. Planets summarize rather than itemize. A few names resolve as raw IDs. When these change, this page changes.",
        },
      ],
    },
  ],
  cta: {
    title: "Give your AI the whole empire.",
    sub: "Works with Claude and ChatGPT. Add Stellaris and your next save gets audited.",
    label: "ADD STELLARIS",
  },
};
