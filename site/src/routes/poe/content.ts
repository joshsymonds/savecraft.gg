import type { GamePageContent } from "$lib/components/marketing/game-page";

import { withoutPoB, withPoB } from "./demos";

/**
 * Path of Exile landing page content -- headless Path of Building in chat,
 * plus reference modules grounded in real game data (gems, tree, uniques,
 * mods, live economy).
 */
export const content: GamePageContent = {
  seo: {
    title: "Path of Exile -- Build Planner for Claude & ChatGPT | Savecraft",
    metaDescription:
      "Savecraft is GGG-approved. Link your Path of Exile account and your AI runs your live characters through the real Path of Building calc engine -- or paste a pobb.in link. Real DPS deltas and live poe.ninja prices for budget upgrades.",
    ogTitle: "Savecraft -- Path of Building in Chat",
    ogDescription:
      "GGG-approved account connect: your AI reads your live PoE characters and runs them through real Path of Building. Or paste a pobb.in link. Real DPS deltas plus live poe.ninja prices.",
    jsonDescription:
      "GGG-approved account connect: your AI runs your live characters through the real Path of Building calc engine.",
    path: "/poe",
  },
  gameName: "Path of Exile",
  theme: {
    accent: "#c8a84e",
    accentBright: "#e8c86e",
    onAccent: "#05071a",
    heroBackground:
      "radial-gradient(ellipse at 25% 15%, rgba(100, 30, 20, 0.35) 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, rgba(80, 60, 10, 0.3) 0%, transparent 50%), linear-gradient(180deg, #0a0305 0%, #130510 25%, #160a22 60%, #0a0e2e 100%)",
    particleSeed: 241,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "PATH OF BUILDING IN CHAT",
    title: "Real DPS deltas, real tree math, your actual build.",
    subtitle:
      "Savecraft is GGG-approved. Link your account or paste a pobb.in link, and your AI calls the real Path of Building calc engine on your build. Live poe.ninja prices come in too.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/poe/poe3.jpeg",
        width: 1654,
        height: 1538,
        alt: "Claude swapping Void Manipulation for Concentrated Effect in a PoE build -- before/after table showing +766k DPS (+14.7%) with real Path of Building calc deltas",
      },
      {
        src: "/images/poe/poe2.jpg",
        width: 1512,
        height: 1522,
        alt: "Hierophant Level 94 Templar build analysis -- 5.22M DPS, 20.9k Life, resistances, offense stats, socket groups rendered from pob-server",
      },
      {
        src: "/images/poe/poe2.jpg",
        alt: "Path of Building analysis of a Level 94 Hierophant in chat -- 5.22M DPS, 20.9k Life, full resistances and socket groups, no copy-paste",
      },
    ],
    primaryCta: { label: "CONNECT YOUR ACCOUNT" },
    secondaryCta: { label: "SEE THE TOOLS", href: "#tools" },
  },
  proofItems: [
    "GGG-approved connected app",
    "Path of Building calc engine",
    "poe.ninja live economy",
    "RePoE -- gems, uniques, mods, tree",
    "GGG passive tree export",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "NEW -- GGG-APPROVED ACCOUNT CONNECT",
      title: "Connect your account, or paste a link.",
      subtitle:
        "Savecraft is a GGG-approved connecting application. Every DPS number comes from Path of Building itself -- Savecraft ferries the build to the calc engine and the result back.",
      treatment: "tinted",
      items: [
        {
          source: "Connect your account",
          desc: "Link your Path of Exile account once, through GGG's official OAuth -- read-only, character data only. Every non-deleted character is imported: gear, the full passive tree, jewels (cluster jewels included), skill links. Then you ask your AI about your own characters by name -- \"where is my Champion losing the most damage?\"",
        },
        {
          source: "Or paste a link",
          desc: "Not your build, or not connected? Drop a pobb.in, pastebin, maxroll, poe.ninja, rentry, or poedb URL and it runs through the same headless Path of Building. Compare your live character against a guide's link in a single request.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "EXPERT MODULES",
      title: "Real data for every build.",
      subtitle:
        "Every answer comes from PoB's calc engine, current RePoE data, and live poe.ninja prices.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "GEM SWAP -- REAL CALC DELTA",
          without: withoutPoB,
          withoutCaption:
            "Stale memory. Ballpark numbers. No idea what your actual build looks like.",
          with: withPoB,
          withCaption: "Real PoB calc on your actual build, with the cheaper alternative priced too.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "Coaches your build at every stage",
      subtitle: "Gem swaps, tree audits, upgrade budgets -- each one runs the real calc.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "BUILD PLANNER",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "I'm farming maps. Awakened Added Cold is 40 div on trade -- worth it over my L21 Added Cold?",
            },
            {
              role: "ai",
              text: "Tested both on your pobb.in. Added Cold L21: 3.8M DPS. Awakened Added: 4.4M DPS (+15.8%). Worth it if you're min-maxing. Check the tree first though: Heart of Ice is three points away for +8% of that, no divines spent.",
            },
          ],
        },
        {
          icon: "=",
          label: "TREE AUDITOR",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Audit my passive tree -- what's underperforming?",
            },
            {
              role: "ai",
              text: "Weakest branch: Resolute Technique, 6 points. Cutting it loses 380k DPS but frees all 6. Nearby high-impact nodes: Savagery (+820k DPS, 4 points) and Heart of Flame (+310k, 3 points). The swap costs one extra point and gains ~750k DPS net.",
            },
          ],
        },
        {
          icon: "+",
          label: "ECONOMY SCOUT",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "I have 30 divines. Best upgrade for my build?",
            },
            {
              role: "ai",
              text: "Cheaper than you think. Taste of Hate is 14 chaos right now -- 10-15% of your phys as extra cold. Ashes of the Stars is 50c for +1 to all skill gems. The only real spend is Bottled Faith at 7 div, and it's up 15% this week -- if you want it, buy today.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM URL TO DPS",
      title: "Connect or paste. Get real answers.",
      subtitle:
        "Path of Exile is a server-side game. Connect your account and Savecraft reads your live characters straight from GGG -- or hand it a build link. Either way, the build runs through real Path of Building on our infrastructure.",
      treatment: "tinted",
      steps: [
        {
          title: "Connect your account or paste a link",
          desc: "Connect once via GGG's official OAuth and every character is available by name -- or drop a pobb.in, pastebin, maxroll, poe.ninja, rentry, or poedb URL. Your AI calls the build_planner tool either way.",
        },
        {
          title: "Savecraft runs real PoB",
          desc: "Our pob-server decodes the build, loads it into a LuaJIT process running Path of Building Community Fork, and returns DPS, life, resists, and a permanent buildId for follow-up calls.",
        },
        {
          title: "Iterate in conversation",
          desc: "Ask your AI to swap a gem, change a passive, or scan the nearby tree for the biggest impact node. Each modification returns a new buildId, so you can branch hypotheses and compare results.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "The same sources serious PoE players already trust.",
      treatment: "plain",
      items: [
        {
          source: "Path of Building",
          desc: "The Community Fork's canonical calc engine, running as a headless LuaJIT service (pob-server) behind Savecraft. Every DPS number, EHP calculation, and tree traversal matches what you'd see in PoB itself. Pinned to a specific commit so upstream changes don't silently shift answers.",
        },
        {
          source: "RePoE",
          desc: "The community-maintained extraction of PoE's game data -- gems, uniques, mods, base items, stat translations -- updated per patch. Indexed into D1 with FTS5 full-text search and Vectorize embeddings for semantic lookup.",
        },
        {
          source: "poe.ninja",
          desc: "Live item pricing fetched directly from the public poe.ninja API with per-isolate 1-hour caching and singleflight deduplication. 7-day sparklines and listing counts so you can tell a confident price from a thin one.",
        },
        {
          source: "Content-addressed builds",
          desc: 'Every build (original or modified) is content-hashed and gets a permanent short URL at <code>pob.savecraft.gg/{id}</code>. Parent-child lineage tracks modifications, so you can branch hypotheses, compare, and share any state.',
        },
      ],
    },
  ],
  cta: {
    title: "Give your AI the real calc.",
    sub: "Works with Claude and ChatGPT. Connect your account or paste a link.",
    label: "CONNECT YOUR ACCOUNT",
  },
};
