import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Path of Exile 2 landing page content -- GGG-approved account connect
 * for live PoE2 characters, plus poe.ninja's PoE2 economy. Demo-led hero
 * (no capture assets yet). Character specifics in demo copy come from the
 * adapter's own test fixture (plugins/poe2/testdata/): InfernalConcoction,
 * level 87 Chronomancer, Standard league, Expert Bone Sabre + Expert Chain
 * Mail with rune sockets, plain Nubuck Gloves without.
 */
export const content: GamePageContent = {
  seo: {
    title: "Path of Exile 2 with Claude & ChatGPT -- Live Characters | Savecraft",
    metaDescription:
      "Connect your GGG account and Claude or ChatGPT reads your live Path of Exile 2 characters -- equipped gear, skill gems with their supports, passive tree -- plus live poe.ninja prices in divines, by league.",
    ogTitle: "Savecraft -- Your PoE2 Characters, For Your AI",
    ogDescription:
      "GGG-approved account connect: your AI reads your live Path of Exile 2 characters -- gear, gems, passive tree -- with live poe.ninja prices in divines, by league.",
    jsonDescription:
      "GGG-approved account connect: Claude and ChatGPT read your live Path of Exile 2 characters, with live poe.ninja economy data.",
    path: "/poe2",
  },
  gameName: "Path of Exile 2",
  theme: {
    accent: "#6fa8d8",
    accentBright: "#9cd0f5",
    onAccent: "#04101e",
    heroBackground:
      "radial-gradient(ellipse at 20% 10%, rgba(40, 90, 150, 0.45) 0%, transparent 55%), radial-gradient(ellipse at 80% 45%, rgba(150, 60, 30, 0.28) 0%, transparent 50%), radial-gradient(ellipse at 50% 90%, rgba(20, 50, 90, 0.35) 0%, transparent 60%), linear-gradient(180deg, #030810 0%, #061224 30%, #0a1830 60%, #0a0e2e 100%)",
    particleSeed: 419,
    heroAccent: "blue",
  },
  hero: {
    eyebrow: "GGG-APPROVED ACCOUNT CONNECT",
    title: "Your Path of Exile 2 characters, in Claude.",
    subtitle:
      "Connect once through GGG's official OAuth -- read-only -- and your AI sees every character's equipped gear, skill gems with their supports, and passive tree. Live poe.ninja prices come along, in divines, by league. Works with Claude and ChatGPT.",
    demo: {
      headerLabel: "CONNECTED CHARACTER -- GEAR CHECK",
      conversation: [
        {
          role: "player",
          text: "What should I upgrade first on my Chronomancer?",
        },
        {
          role: "ai",
          text: "Looking at InfernalConcoction, your level 87 Chronomancer in Standard: the gloves trail everything else -- a plain Nubuck base with no rune sockets, next to an Expert Bone Sabre and Expert Chain Mail that both have sockets. Gloves first. Want current prices from poe.ninja, in divines?",
        },
      ],
    },
    primaryCta: { label: "CONNECT YOUR ACCOUNT" },
    secondaryCta: { label: "SEE WHAT IT READS", href: "#connect" },
  },
  proofItems: [
    "GGG-approved connected app",
    "Official PoE2 character API -- read-only",
    "poe.ninja PoE2 live economy",
    "Alpha release -- PoB2 analysis on the roadmap",
  ],
  sections: [
    {
      kind: "methodGrid",
      id: "connect",
      eyebrow: "ACCOUNT CONNECT",
      title: "Connect once. Every character comes along.",
      subtitle:
        "Savecraft is a GGG-approved connecting application. The connection is read-only and scoped to your characters and profile -- nothing else.",
      treatment: "tinted",
      items: [
        {
          source: "What your AI sees",
          desc: "Every character on your account: equipped gear with rune sockets, the skill gems you've socketed with their supports, and your full passive tree allocation including ascendancy picks. Ask about any character by name.",
        },
        {
          source: "How fresh the data is",
          desc: "Character data reflects your last refresh, not real-time -- refresh in Savecraft and ask again after a gear swap. This is an early (alpha) release: the API doesn't expose unequipped inventory, and Path of Building-style DPS analysis isn't here yet (PoB2 enrichment is on the roadmap).",
        },
      ],
    },
    {
      kind: "modules",
      eyebrow: "REFERENCE MODULES",
      title: "Live economy, honestly sourced.",
      subtitle:
        "Reference modules work the moment you add the game -- no account connection required.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "GEAR ADVICE -- FROM YOUR ACTUAL CHARACTER",
          without: [
            {
              role: "player",
              text: "I'm gearing my Chronomancer for cruel. What's my weakest slot?",
            },
            {
              role: "ai",
              text: "Focus on getting your chest to a 4-link first, cap your resistances, and look for life on every slot. A Tabula Rasa is a cheap way to bridge the gap if you can trade for one.",
            },
          ],
          withoutCaption:
            "Links don't exist in PoE2. That's PoE1 muscle memory answering about a game it can't see.",
          with: [
            {
              role: "player",
              text: "I'm gearing my Chronomancer for cruel. What's my weakest slot?",
            },
            {
              role: "ai",
              text: "From your connected character: the gloves. They're a plain Nubuck base with no rune sockets, while your sabre and chain mail are both Expert bases with sockets. Replace the gloves, then let's look at what your passive tree still wants on the way to cruel.",
            },
          ],
          withCaption: "Your actual slots, your actual sockets, PoE2 mechanics only.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "Honest answers about a live game",
      subtitle: "Fresh-by-refresh character data, league-labeled prices, and no guessing.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "GEAR CHECK",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "Did the new body armour make it onto my character?",
            },
            {
              role: "ai",
              text: "Your data reflects the last refresh, not real-time -- hit refresh in Savecraft and ask again. As of your last sync I see the Aegis of the Unshaken chain mail equipped, so if you swapped after that, the new piece hasn't landed in my view yet.",
            },
          ],
        },
        {
          icon: "+",
          label: "LEAGUE ECONOMIST",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "What's that unique going for right now?",
            },
            {
              role: "ai",
              text: "I'll pull it from poe.ninja's PoE2 data -- every price comes back denominated in divines and labeled with the league it came from. And if poe.ninja can't confirm a price, you get 'unavailable', never a guess dressed up as a number.",
            },
          ],
        },
        {
          icon: "=",
          label: "TREE PLANNER",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "What did I actually take on the way to Chronomancer?",
            },
            {
              role: "ai",
              text: "Your full passive allocation imports with the character -- every node you've taken plus your ascendancy picks. When you want to plan a rework, we start from what you actually have instead of a half-remembered tree.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM OAUTH TO ANSWERS",
      title: "Three steps, no files.",
      subtitle:
        "Path of Exile 2 is a server-side game -- there's nothing to install and no saves to watch. The connection does all the work.",
      treatment: "tinted",
      steps: [
        {
          title: "Connect your GGG account",
          desc: "One click through GGG's official OAuth. Read-only, scoped to characters and profile. Savecraft is a GGG-approved connecting application.",
        },
        {
          title: "Characters import",
          desc: "Every non-deleted character comes in: equipped gear, skill gems with their supports, and the full passive tree with ascendancy choices.",
        },
        {
          title: "Ask, refresh, repeat",
          desc: "Ask about any character by name. After a session, refresh in Savecraft to pull the latest state -- your AI always tells you how fresh its view is.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "Official APIs, defensive engineering, and a roadmap we're honest about.",
      treatment: "plain",
      items: [
        {
          source: "GGG's official API",
          desc: "Character data comes straight from Grinding Gear Games' own API through an approved, read-only OAuth connection. No scraping, no session tokens, no account risk.",
        },
        {
          source: "poe.ninja, defensively",
          desc: "poe.ninja's PoE2 API is undocumented and has already changed shape once -- so every response is contract-validated before use. A mismatch, error, or timeout degrades to one clear 'unavailable' message. You never get partial prices or stale guesses presented as fresh.",
        },
        {
          source: "The roadmap, honestly",
          desc: "No Path of Building-style calc yet -- PoB2 enrichment is a future epic. No unequipped inventory -- GGG's PoE2 API doesn't expose it. When these land, this page will say so; until then, we don't pretend.",
        },
      ],
    },
  ],
  cta: {
    title: "Give your AI your actual exile.",
    sub: "GGG-approved, read-only, works with Claude and ChatGPT.",
    label: "CONNECT YOUR ACCOUNT",
  },
};
