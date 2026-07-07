import type { GamePageContent } from "$lib/components/marketing/game-page";
import {
  standardCaptions,
  standardHeaderLabel,
  withoutStandard,
  withStandard,
} from "$lib/demos/standard-rotation";

import { withCommander, withoutCommander } from "./demos";

/**
 * Magic: The Gathering landing page content -- all-format reference tools
 * (Commander, Standard, draft, Legacy) that work the moment Magic is added,
 * plus Arena coaching once Magic is reading your Player.log.
 */
export const content: GamePageContent = {
  seo: {
    title: "Magic: The Gathering -- Real Data for Your AI | Savecraft",
    metaDescription:
      "Real card data for Claude and ChatGPT -- every Magic format, the moment you add the game. EDHREC for Commander, 17Lands for limited, plus the full MTG rules. Add Magic on the machine you play Arena on and your live game state comes along too.",
    ogTitle: "Savecraft -- Real MTG Data for Claude and ChatGPT",
    ogDescription:
      "Real card data, every Magic format, the moment you add the game. EDHREC for Commander, 17Lands for limited, plus the full MTG rules. Add Magic on the machine you play Arena on and your live game state comes along too.",
    jsonDescription:
      "Real card data for Claude and ChatGPT -- every Magic format, the moment you add the game.",
    path: "/magic",
  },
  gameName: "Magic: The Gathering",
  theme: {
    accent: "#c8a84e",
    accentBright: "#e8c86e",
    onAccent: "#05071a",
    heroBackground:
      "radial-gradient(ellipse at 25% 15%, rgba(60, 40, 10, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, rgba(10, 20, 50, 0.4) 0%, transparent 50%), linear-gradient(180deg, #010214 0%, #030518 25%, #060a22 60%, #0a0e2e 100%)",
    particleSeed: 137,
    heroAccent: "gold",
  },
  hero: {
    eyebrow: "MAGIC, WITHOUT THE HALLUCINATED CARDS",
    title: "Your AI stops inventing cards here.",
    subtitle:
      "Every Magic format, the second you add the game. EDHREC, 17Lands, the full MTG rules. Play Arena? Add Magic on that machine and your live picks come along too.",
    variant: "solo-peek",
    frames: [
      {
        src: "/images/magic/magic-good.jpeg",
        alt: "Claude reviewing a Magic TMNT draft -- user asks 'how did I do?', Claude pulls draft history and renders a 14/12/3/12 Optimal/Good/Questionable/Miss review with a pick timeline filtered by outcome",
      },
      {
        src: "/images/magic/rocks.jpg",
        alt: "Claude recommending 3-CMC mana rocks for Commander -- tabbed grid of Eye / Heart / Horn / Skull / Tooth of Ramos colored by mana identity",
      },
      {
        src: "/images/magic/lifelink.jpg",
        alt: "Claude listing every white lifelink creature 2 mana or less -- framed card grid with rarity chips and abilities",
      },
    ],
    primaryCta: { label: "CONNECT CLAUDE OR CHATGPT" },
    secondaryCta: { label: "SEE WHAT YOUR AI KNOWS", href: "#tools" },
  },
  proofItems: [
    "17Lands data across 31 color archetypes",
    "Frank Karsten mana base methodology",
    "EDHREC Commander data",
    "Scryfall + MTG Comprehensive Rules",
  ],
  sections: [
    {
      kind: "modules",
      id: "tools",
      eyebrow: "EXPERT MODULES",
      title: "Real data for every format.",
      subtitle: "Every answer comes from real card data and published methodology.",
      treatment: "tinted",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: standardHeaderLabel,
          without: withoutStandard,
          withoutCaption: standardCaptions.without,
          with: withStandard,
          withCaption: standardCaptions.with,
        },
        {
          headerLabel: "COMMANDER -- ATRAXA DECK REVIEW",
          without: withoutCommander,
          withoutCaption: "Vague advice. Nothing specific.",
          with: withCommander,
          withCaption: "EDHREC aggregate data. Specific staples you're missing.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "Coaches the game you're playing",
      subtitle: "Draft, Constructed, or Commander -- the coaching follows your format.",
      treatment: "plain",
      // Facts verified 2026-06-10 against Savecraft's own modules: card_stats
      // (FDN: Liliana, Dreadhorde General 64.1% GIH WR, Elenda, Saint of Dusk
      // 61.5%; TMT: Raphael, Tough Turtle 55.2% vs 56.6% set avg, WR IWD -2.4pp;
      // Everything Pizza 63.4%, IWD +10.7pp), card_search (Liliana costs 4BB),
      // commander_lookup (Korvold 19,882 decks; Dark Ritual synergy +25pp,
      // Ignoble Hierarch 64%, Sakura-Tribe Elder 48% inclusion).
      cards: [
        {
          icon: "*",
          label: "DRAFT COACH",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "P2P1 -- Liliana or Elenda? Liliana's the bomb but I'm UW with one black source.",
            },
            {
              role: "ai",
              text: "Liliana. She beats Elenda 64.1% to 61.5% GIH WR and usually goes first pick. Double black on one source is fixable at pick 15: take the bomb, then grab black fixing over your next few picks.",
            },
          ],
        },
        {
          icon: "+",
          label: "DECK DOCTOR",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "I have 24 playables in WR. Need to cut 1.",
            },
            {
              role: "ai",
              text: "Cut Raphael, Tough Turtle. I know, he looks cool -- but he wins 55.2% of games in hand against a 56.6% set average, and in WR decks drawing him costs you 2.4 points of win rate. Everything Pizza is in your pool at 63.4% GIH WR, +10.7 points when you draw it. Run the pizza.",
            },
          ],
        },
        {
          icon: "o",
          label: "COMMANDER ADVISOR",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Building Korvold -- what does everyone else run that I'm not?",
            },
            {
              role: "ai",
              text: "Out of 19,882 Korvold decks on EDHREC, the most-played card you're missing is Ignoble Hierarch (64%). The highest-synergy one is Dark Ritual -- it shows up 25 points more often in Korvold lists than in other Jund decks. And Sakura-Tribe Elder, sac fodder that replaces itself, is in nearly half of all lists.",
            },
          ],
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "HOW IT WORKS",
      title: "Add Magic.",
      subtitle: "Reference data answers immediately. Arena players get their live game state too.",
      treatment: "tinted",
      ctaLabel: "CONNECT CLAUDE OR CHATGPT",
      items: [
        {
          source: "Reference, immediately",
          desc: "Add the game and every format comes online -- EDHREC staples for Commander, 17Lands stats for Limited, Karsten's math for mana bases, plus the full Comprehensive Rules behind everything.",
        },
        {
          source: "Your live Arena game",
          desc: "Add Magic on the machine you play Arena on, and Savecraft walks you through pairing it once. It reads MTGA's Player.log in place -- the log stays on your device, only parsed state goes up. From that, your AI can coach a live draft, audit your Constructed list against winning archetypes, or quote the wildcard cost of a swap before you spend it. Caveats: turn on Arena's Detailed Logs first; the log resets when Arena restarts; and Arena never writes your card collection to it, so ownership is the one thing Savecraft can't see.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "The same sources serious Magic players already trust.",
      treatment: "plain",
      items: [
        {
          source: "17Lands",
          desc: "Per-card win rates across all 31 color archetypes -- mono through five-color -- plus synergy matrices and draft signal data from millions of real Arena games. Bayesian shrinkage ensures sparse archetypes blend toward the overall mean instead of producing noisy recommendations. Licensed CC BY 4.0.",
        },
        {
          source: "Frank Karsten",
          desc: 'Hypergeometric mana base calculations from "How Many Sources Do You Need to Consistently Cast Your Spells?" Pre-computed castability tables for exact on-curve probability.',
        },
        {
          source: "EDHREC",
          desc: "Aggregate Commander deck data from thousands of commanders: per-commander recommendations (staples, themes, High Synergy cards) and average decklists, filterable by color-identity subset.",
        },
        {
          source: "WASPAS",
          desc: "Weighted Aggregated Sum Product Assessment -- a multi-criteria decision method that blends 8 scoring axes with pick-adaptive weights across all 31 archetype candidates, format-adjusted by empirical win rate so the system naturally steers toward stronger archetypes. Early picks favor baseline power; late picks favor synergy and castability. Sigmoid-calibrated from each set's empirical distribution.",
        },
        {
          source: "Scryfall + WotC",
          desc: "Complete card database, oracle text, and the full MTG Comprehensive Rules with semantic search via Reciprocal Rank Fusion (keyword + vector embedding).",
        },
      ],
    },
  ],
  cta: {
    title: "Give your AI the real data.",
    sub: "Connect Claude or ChatGPT, add Magic, and your AI stops inventing cards.",
    label: "CONNECT CLAUDE OR CHATGPT",
  },
};
