import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * RimWorld landing page content -- the in-game mod pushes full colony
 * state on every save, and eight calculators run the game's exact
 * decompiled formulas. All numbers quoted in demo copy come verbatim
 * from the reference modules' own fixture outputs (the same data behind
 * the hero captures in static/images/rimworld/).
 */
export const content: GamePageContent = {
  seo: {
    title: "RimWorld with Claude & ChatGPT -- Real Colony Math | Savecraft",
    metaDescription:
      "Savecraft's RimWorld mod gives Claude and ChatGPT your live colony plus calculators running the game's exact formulas -- surgery success, raid points, crop yields, combat DPS, gene builds. Install from the Steam Workshop.",
    ogTitle: "Savecraft -- RimWorld's Real Formulas for Your AI",
    ogDescription:
      "Your live colony plus the game's exact math: surgery success, raid points, crop yields, combat DPS, gene builds. An in-game mod pushes colony state on every save.",
    jsonDescription:
      "Savecraft's RimWorld mod gives Claude and ChatGPT your live colony plus calculators running the game's exact formulas.",
    path: "/rimworld",
  },
  gameName: "RimWorld",
  theme: {
    accent: "#d0824e",
    accentBright: "#e8a26e",
    onAccent: "#160a05",
    heroBackground:
      "radial-gradient(ellipse at 25% 15%, rgba(120, 60, 20, 0.35) 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, rgba(70, 60, 25, 0.3) 0%, transparent 50%), linear-gradient(180deg, #0d0603 0%, #140a06 25%, #12101f 60%, #0a0e2e 100%)",
    particleSeed: 83,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "THE GAME'S EXACT FORMULAS, IN CHAT",
    title: "RimWorld's real math, in Claude.",
    subtitle:
      "Savecraft's in-game mod pushes your colony on every save -- colonists, resources, research, defenses. Eight calculators answer with the game's own decompiled formulas. Works with Claude and ChatGPT.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/rimworld/surgery-low-success.webp",
        width: 1304,
        height: 642,
        alt: "Surgery success calculator showing a 12.6% success chance from the exact CheckSurgeryFail factors -- 0.35 surgeon, 0.80 regular bed, 0.60 herbal medicine, against an operation of 1.50 difficulty",
      },
      {
        src: "/images/rimworld/raids-late-game.png",
        width: 782,
        height: 1000,
        alt: "Raid threat estimate for a late-game colony -- 6200 total raid points, 3800 from 800,000 effective wealth and 2400 from colonists",
      },
      {
        src: "/images/rimworld/combat-bolt-action-vs-armor.png",
        width: 846,
        height: 774,
        alt: "Bolt-action rifle combat card -- 4.68 DPS at range from 5.50 raw at 85% accuracy, 12.3 expected damage versus armor",
      },
    ],
    primaryCta: { label: "ADD RIMWORLD" },
    secondaryCta: { label: "SEE THE CALCULATORS", href: "#tools" },
  },
  proofItems: [
    "Exact formulas from the game's decompiled code",
    "Eight calculators -- surgery, combat, crops, raids, genes",
    "In-game mod on the Steam Workshop",
    "Colony state pushed on every save",
    "Alpha release -- vanilla RimWorld, actively expanding",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "MOD-POWERED",
      title: "Subscribe once. Your colony comes along.",
      subtitle:
        "RimWorld doesn't write readable save data mid-session, so Savecraft ships an in-game mod instead -- it exports structured colony state every time the game saves.",
      treatment: "tinted",
      items: [
        {
          source: "Install the mod",
          desc: "Subscribe to Savecraft on the Steam Workshop and add it to your mod list. It's a standard Harmony mod: safe to add or remove mid-save, no game files touched.",
        },
        {
          source: "Your colony, on every save",
          desc: "Each save exports colonists (skills, health, mood), resources, research progress, defenses, farming, and factions as structured data. This is an early (alpha) release: vanilla content for now -- modded stats and custom hediffs aren't parsed yet, and very large colonies (30+ colonists) may hitch briefly during collection.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "EIGHT CALCULATORS",
      title: "The game's own math, not vibes.",
      subtitle:
        "Every calculator implements the formula from RimWorld's decompiled code -- the same numbers the game computes internally.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "SURGERY RISK -- REAL FORMULA",
          without: [
            {
              role: "player",
              text: "Should I risk installing the bionic leg on Anya tonight?",
            },
            {
              role: "ai",
              text: "Bionic surgery is generally safe when you have a decent doctor and a clean room. If Anya's in stable condition, it should be fine to go ahead.",
            },
          ],
          withoutCaption:
            "Generic reassurance. No formula, no numbers, no idea who your surgeon is.",
          with: [
            {
              role: "player",
              text: "Should I risk installing the bionic leg on Anya tonight?",
            },
            {
              role: "ai",
              text: "Not tonight. With the surgeon you have awake right now, the game's formula lands at 12.6% -- a 0.35 surgeon factor, a 0.80 regular bed, and 0.60 herbal medicine, dragged down further by the operation's 1.50 difficulty. Wait for your real doctor and industrial medicine; the same operation becomes routine.",
            },
          ],
          withCaption:
            "The exact CheckSurgeryFail factor chain, computed on your colony's actual options.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "Coaches the colony you're actually running",
      subtitle: "Raid prep, load-outs, grow-ops -- each answer runs the game's real numbers.",
      treatment: "plain",
      // Numbers below are verbatim module fixture outputs (see
      // static/images/rimworld/ captures): raid estimate 6200 = 3800
      // wealth + 2400 colonist points at 800,000 effective wealth;
      // bolt-action 4.68 DPS at range / 5.50 raw / 85% accuracy / 12.3
      // expected vs armor; devilstrand on gravel 0.49x growth, 46.8
      // days, 0.342 silver/day/tile.
      cards: [
        {
          icon: "*",
          label: "RAID PLANNER",
          color: "var(--color-red)",
          examples: [
            {
              role: "player",
              text: "We're sitting at 800k wealth. How bad is the next raid going to be?",
            },
            {
              role: "ai",
              text: "Around 6,200 raid points: 3,800 from wealth and 2,400 from your colonists. Points follow the piecewise wealth curve from the storyteller's code, so that masterwork sculpture in your dining room is adding to the raid math. Sell it off before the next quadrum if you want a slightly quieter year.",
            },
          ],
        },
        {
          icon: "=",
          label: "QUARTERMASTER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Bolt-action or assault rifle for the sniper on my wall?",
            },
            {
              role: "ai",
              text: "At that distance the bolt-action delivers 4.68 DPS of its 5.50 raw -- 85% accuracy at the long-range breakpoint -- and 12.3 expected damage per hit against armored raiders. Accuracy interpolates across four range breakpoints, so the answer flips if they close the gap: keep a shotgunner behind the door.",
            },
          ],
        },
        {
          icon: "+",
          label: "GROW-OP ADVISOR",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "Is devilstrand worth planting on the gravel patch?",
            },
            {
              role: "ai",
              text: "Barely. On gravel, devilstrand grows at 0.49x -- 46.8 days to harvest, and it earns just 0.342 silver per tile-day. Devilstrand is fertility-sensitive, so give it your good soil and use the gravel for something that doesn't care. If you need food first, rice is the fast path.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM WORKSHOP TO ANSWERS",
      title: "Three steps to a smarter colony.",
      subtitle:
        "The mod does the exporting; the calculators do the math. You just ask questions in plain language.",
      treatment: "tinted",
      steps: [
        {
          title: "Subscribe on the Workshop",
          desc: "Add the Savecraft mod to your RimWorld mod list and pair it with your Savecraft account once. Safe to add or remove mid-save.",
        },
        {
          title: "Play. Save. Done.",
          desc: "Every save pushes your colony's structured state -- no exports to run, no files to find. The data is there the next time you ask.",
        },
        {
          title: "Ask about your colony",
          desc: "Surgery odds on a specific pawn, the raid your wealth is inviting, what to plant where -- your AI reads your colony and runs the game's formulas on it.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "The math comes from the game itself, not from a wiki.",
      treatment: "plain",
      items: [
        {
          source: "Decompiled game code",
          desc: "Formulas are implemented from RimWorld's own decompiled assemblies -- surgery success from Recipe_Surgery.CheckSurgeryFail, raid points from the StorytellerUtility wealth curve -- and verified against in-game behavior each patch. Exact math, not approximations.",
        },
        {
          source: "The game's XML Defs",
          desc: "Crop stats, weapon profiles, material factors, and gene data are generated from RimWorld's own XML Defs, so every number matches your game version's data files.",
        },
        {
          source: "Vanilla first, honestly",
          desc: "Modded content -- added stats, custom hediffs -- isn't parsed yet. If your colony leans on mods, the colony state is still useful; the calculators answer for vanilla mechanics.",
        },
        {
          source: "Ludeon Studios",
          desc: "RimWorld is Ludeon Studios' game; Savecraft is an unaffiliated companion tool. Attribution and sources ship with every module answer.",
        },
      ],
    },
  ],
  cta: {
    title: "Give your AI the real formulas.",
    sub: "Works with Claude and ChatGPT. Subscribe on the Workshop and your colony comes along.",
    label: "ADD RIMWORLD",
  },
};
