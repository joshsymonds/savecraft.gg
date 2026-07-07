import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * World of Warcraft landing page content -- Battle.net character
 * profiles with Raider.io enrichment, plus four anti-hallucination
 * modules. Demo-led hero. Character specifics in demo copy come from
 * the adapter's own test fixtures (plugins/wow/testdata/): Dratnos on
 * Tichondrius, M+ rating 2524.7, timed +12s in The Rookery and
 * Darkflame Cleft, a +10 in Operation: Floodgate.
 */
export const content: GamePageContent = {
  seo: {
    title: "World of Warcraft with Claude & ChatGPT -- Season-Current Answers | Savecraft",
    metaDescription:
      "Connect Battle.net and Claude or ChatGPT reads your WoW characters -- gear, Mythic+ rating, raid progress -- with season-current dungeon rotations and real boss abilities instead of stale training data.",
    ogTitle: "Savecraft -- WoW Answers From This Season, Not 2019",
    ogDescription:
      "Your characters via Battle.net, Raider.io ratings, the current M+ rotation, and real boss abilities. Your AI stops living three expansions ago.",
    jsonDescription:
      "Savecraft connects Battle.net so Claude and ChatGPT read your WoW characters, with season-current rotations and real boss data.",
    path: "/wow",
  },
  gameName: "World of Warcraft",
  theme: {
    accent: "#4a9aea",
    accentBright: "#7cbcf5",
    onAccent: "#04101f",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(25, 80, 160, 0.45) 0%, transparent 52%), radial-gradient(ellipse at 78% 45%, rgba(160, 120, 20, 0.25) 0%, transparent 50%), linear-gradient(180deg, #030710 0%, #061226 30%, #0a1630 60%, #0a0e2e 100%)",
    particleSeed: 528,
    heroAccent: "blue",
  },
  hero: {
    eyebrow: "SEASON-CURRENT, NOT STALE",
    title: "World of Warcraft, current in Claude.",
    subtitle:
      "Your AI's WoW knowledge is expansions old. Savecraft connects your Battle.net account and grounds every answer in this season's dungeons, real boss abilities, and your actual characters. Works with Claude and ChatGPT.",
    demo: {
      headerLabel: "MYTHIC+ CHECK -- LIVE PROFILE",
      conversation: [
        {
          role: "player",
          text: "Where's my M+ rating at, and what should I push next?",
        },
        {
          role: "ai",
          text: "Dratnos is sitting at 2524 -- you've got timed 12s banked in The Rookery and Darkflame Cleft, and Operation: Floodgate at +10 is a soft spot. Push Floodgate to a 12 before re-timing the others -- a fresh +12 there gains more than re-running keys you've already timed.",
        },
      ],
    },
    primaryCta: { label: "CONNECT BATTLE.NET" },
    secondaryCta: { label: "SEE THE MODULES", href: "#tools" },
  },
  proofItems: [
    "Official Battle.net API -- read-only",
    "Raider.io rating enrichment",
    "This season's rotation, not training data",
    "Beta -- data updates on logout",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "ACCOUNT CONNECT",
      title: "Connect once. Your roster comes along.",
      subtitle:
        "WoW is a server-side game -- no files, no addons. Savecraft reads character profiles through Blizzard's official API and enriches them with Raider.io.",
      treatment: "tinted",
      items: [
        {
          source: "What your AI sees",
          desc: "Your characters with equipped gear, item levels, Mythic+ rating and best runs, and raid progress -- plus Raider.io rankings for context. Ask about any character by name.",
        },
        {
          source: "How fresh, honestly",
          desc: "Blizzard updates character data on logout, not in real-time -- log out and refresh to see a new piece of gear. The API doesn't expose bags or bank, and combat performance isn't included yet (Warcraft Logs integration is on the roadmap). This connection is in beta.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "FOUR MODULES",
      title: "Anti-hallucination, by construction.",
      subtitle:
        "Abilities, bosses, and the season rotation -- checked against current data before your AI opens its mouth.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "SEASON CHECK -- CURRENT ROTATION",
          without: [
            {
              role: "player",
              text: "Which dungeons should I practice for this M+ season?",
            },
            {
              role: "ai",
              text: "Great season to push keys! Focus on the classics in the rotation: Mists of Tirna Scithe, De Other Side, and Halls of Atonement are all excellent for learning routes. Freehold is also a community favorite!",
            },
          ],
          withoutCaption: "That's a rotation from years ago. Confidently wrong is worse than unsure.",
          with: [
            {
              role: "player",
              text: "Which dungeons should I practice for this M+ season?",
            },
            {
              role: "ai",
              text: "Let me pull the current rotation rather than guess from memory -- season_info returns this season's actual Mythic+ pool and raid tier. From your profile, you've already timed 12s in two of them; I'd drill the ones where you don't have a timed run yet, starting with the Floodgate route.",
            },
          ],
          withCaption: "The season module answers from live data, and your profile fills in the rest.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "A raid-night companion that checks first",
      subtitle: "Ratings from your profile, mechanics from the encounter data, gear flags from your gear.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "KEY PLANNER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "What's my best rating play this week?",
            },
            {
              role: "ai",
              text: "Your best runs import with the profile -- levels, dungeons, and whether they timed. At 2524 with 12s banked in The Rookery and Darkflame Cleft, the math says upgrade your weakest timed run first, not re-run your best.",
            },
          ],
        },
        {
          icon: "=",
          label: "GEAR CHECKUP",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "Am I missing anything obvious on my gear?",
            },
            {
              role: "ai",
              text: "The gear audit flags exactly the embarrassing stuff: absent enchants, empty gem sockets, and item-level outliers. It won't compute stat weights or best-in-slot -- it catches what you overlooked before the pull, not what a sim would say.",
            },
          ],
        },
        {
          icon: "+",
          label: "TACTICIAN",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "What does the last boss in this dungeon actually do?",
            },
            {
              role: "ai",
              text: "The dungeon guide returns each boss's real ability list from encounter data -- names and descriptions, current content included. No misremembered mechanics from an old tier: what it casts is what I'll tell you.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM LOGIN TO ANSWERS",
      title: "Three steps, no addons.",
      subtitle: "The connection does the work. Your UI stays untouched.",
      treatment: "tinted",
      steps: [
        {
          title: "Connect Battle.net",
          desc: "One click through Blizzard's official OAuth -- read-only character profiles, nothing else.",
        },
        {
          title: "Characters import",
          desc: "Gear, item levels, M+ rating and best runs, raid progress -- enriched with Raider.io rankings.",
        },
        {
          title: "Ask season-current questions",
          desc: "Rotations, boss abilities, gear gaps -- checked against live data before answering, with your characters as context.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Official APIs and per-season data, not memories of old metas.",
      treatment: "plain",
      items: [
        {
          source: "Blizzard's official API",
          desc: "Character profiles come from Battle.net's own API through approved, read-only OAuth. No addons, no scraping, no account risk.",
        },
        {
          source: "Raider.io",
          desc: "Mythic+ ratings and rankings enrich each character, the same source the community already trusts for key pushing.",
        },
        {
          source: "Current-season data",
          desc: "Ability, encounter, and season data update per patch, so 'what does this boss cast' and 'which dungeons are in rotation' answer from now -- not from whenever the training data froze.",
        },
      ],
    },
  ],
  cta: {
    title: "Your AI thinks it's still Shadowlands.",
    sub: "Works with Claude and ChatGPT. Connect Battle.net and it catches up.",
    label: "CONNECT BATTLE.NET",
  },
};
