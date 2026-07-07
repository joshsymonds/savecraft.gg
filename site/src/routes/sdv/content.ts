import type { GamePageContent } from "$lib/components/marketing/game-page";

/**
 * Stardew Valley landing page content -- 1.6 save parsing plus gift and
 * crop reference modules. Demo-led hero (no capture assets). Every gift
 * and crop fact in demo copy is verbatim from the modules' own data
 * tables (plugins/sdv/reference/data.go and data_crops.go): Sebastian's
 * loved gifts; Starfruit 13 days / 750g sell / 400g seed; Ancient Fruit
 * 28 days to first harvest, regrows every 7, 550g.
 */
export const content: GamePageContent = {
  seo: {
    title: "Stardew Valley with Claude & ChatGPT -- Gifts, Crops, Your Farm | Savecraft",
    metaDescription:
      "Savecraft parses your Stardew Valley 1.6 saves and gives Claude and ChatGPT real gift preferences and crop math from the game's own data -- no more invented loves, no more wiki tabs mid-conversation.",
    ogTitle: "Savecraft -- Stardew Valley, Without the Invented Gifts",
    ogDescription:
      "Real gift preferences and crop math from the game's own data, plus your actual 1.6 farm parsed from the save. Works with Claude and ChatGPT.",
    jsonDescription:
      "Savecraft parses Stardew Valley 1.6 saves and grounds Claude and ChatGPT in real gift preferences and crop data.",
    path: "/sdv",
  },
  gameName: "Stardew Valley",
  theme: {
    accent: "#7fbf5e",
    accentBright: "#a8de84",
    onAccent: "#0c1a06",
    heroBackground:
      "radial-gradient(ellipse at 22% 12%, rgba(60, 110, 35, 0.4) 0%, transparent 52%), radial-gradient(ellipse at 78% 45%, rgba(140, 110, 30, 0.28) 0%, transparent 50%), linear-gradient(180deg, #050a03 0%, #0a1408 28%, #0c1220 60%, #0a0e2e 100%)",
    particleSeed: 116,
    heroAccent: "green",
  },
  hero: {
    eyebrow: "NO MORE INVENTED GIFTS",
    title: "Stardew Valley, with Claude on the porch.",
    subtitle:
      "Your AI keeps making up what villagers love. Savecraft gives it the game's actual gift tables and crop math -- and parses your 1.6+ farm from the save. Works with Claude and ChatGPT.",
    demo: {
      headerLabel: "GIFT CHECK -- REAL TASTE TABLES",
      conversation: [
        {
          role: "player",
          text: "What does Sebastian actually love? I keep guessing wrong.",
        },
        {
          role: "ai",
          text: "From the game's own gift tables: Frozen Tear, Obsidian, Void Egg, Sashimi, Pumpkin Soup, and a Frog Egg. Frozen Tears are the farmable pick -- the frozen floors of the mines drop them steadily. And whatever you do, not Clay: it's on his hate list.",
        },
      ],
    },
    primaryCta: { label: "ADD STARDEW VALLEY" },
    secondaryCta: { label: "SEE THE MODULES", href: "#tools" },
  },
  proofItems: [
    "Gift tastes from the game's own data",
    "Crop math -- growth, regrow, profit",
    "Your 1.6 farm, parsed from the save",
    "Beta -- Stardew Valley 1.6+ saves",
  ],
  sections: [
    {
      kind: "methodGrid",
      eyebrow: "SAVE-POWERED",
      title: "Your farm, along for the ride.",
      subtitle:
        "The reference modules answer the moment you add the game. Point the Savecraft daemon at your saves and your actual farm state comes along too.",
      treatment: "tinted",
      items: [
        {
          source: "Reference, instantly",
          desc: "Gift preferences for every villager and crop data for every season work with zero setup -- they're built from the game's own data files, not scraped guesses.",
        },
        {
          source: "Your save, when you want it",
          desc: "Stardew Valley 1.6+ saves parse locally into structured farm state -- the file stays on your machine. Earlier game versions aren't supported, and this integration is in beta.",
        },
      ],
    },
    {
      kind: "modules",
      id: "tools",
      eyebrow: "TWO MODULES",
      title: "The two questions you always ask.",
      subtitle: "Who loves what, and what's worth planting -- answered from data, not vibes.",
      treatment: "plain",
    },
    {
      kind: "compare",
      eyebrow: "THE DIFFERENCE",
      title: "What changes",
      treatment: "bleed",
      pairs: [
        {
          headerLabel: "GIFT ADVICE -- FROM THE GAME'S TABLES",
          without: [
            {
              role: "player",
              text: "What should I give Sebastian for his birthday?",
            },
            {
              role: "ai",
              text: "Sebastian is a quiet, artistic type who loves music -- try giving him a guitar pick, coffee, or one of his favorite books. Most villagers also appreciate flowers and fresh produce from your farm!",
            },
          ],
          withoutCaption: "Guitar picks aren't a Stardew item. Flowers would actively annoy him.",
          with: [
            {
              role: "player",
              text: "What should I give Sebastian for his birthday?",
            },
            {
              role: "ai",
              text: "His loved list is short and specific: Frozen Tear, Obsidian, Void Egg, Sashimi, Pumpkin Soup, Frog Egg. Sashimi is the cheap play -- any fish plus Kitchen. On his birthday the friendship multiplier makes a loved gift worth eight regular ones, so don't waste it on a 'like.'",
            },
          ],
          withCaption: "The gift module, quoting the game's actual taste tables.",
        },
      ],
    },
    {
      kind: "modes",
      eyebrow: "HOW YOU USE IT",
      title: "An almanac that knows your farm",
      subtitle: "Gifts, crops, and seasons -- grounded in the game's numbers.",
      treatment: "plain",
      cards: [
        {
          icon: "*",
          label: "GIFT CONSULTANT",
          color: "var(--color-green)",
          examples: [
            {
              role: "player",
              text: "Who actually wants all this quartz I keep mining?",
            },
            {
              role: "ai",
              text: "Reverse lookup works too: give the module an item and it returns who loves, likes, and hates it -- universal tastes included. Some gifts that feel generous are secretly hated; check before you hand a villager an 'interesting rock.'",
            },
          ],
        },
        {
          icon: "+",
          label: "CROP ACCOUNTANT",
          color: "var(--color-gold)",
          examples: [
            {
              role: "player",
              text: "Starfruit or Ancient Fruit for summer?",
            },
            {
              role: "ai",
              text: "Starfruit: 13 days, 750g at base, 400g a seed -- big single harvests. Ancient Fruit: 28 days to first harvest, then a new fruit every 7 days at 550g, no replanting. If you're staying liquid mid-summer, Starfruit; if the greenhouse is running, Ancient Fruit compounds all year.",
            },
          ],
        },
        {
          icon: "=",
          label: "SEASON PLANNER",
          color: "var(--color-blue)",
          examples: [
            {
              role: "player",
              text: "What's worth planting with 12 days left in spring?",
            },
            {
              role: "ai",
              text: "The crop module knows growth days, regrowth, fertilizer effects, and artisan values per crop and season -- so the answer accounts for whether a crop can finish before the season flips and what the keg does to its price after.",
            },
          ],
        },
      ],
    },
    {
      kind: "flow",
      eyebrow: "FROM SAVE TO PORCH TALK",
      title: "Three steps to a smarter season.",
      subtitle: "Reference works instantly; the daemon adds your actual farm.",
      treatment: "tinted",
      steps: [
        {
          title: "Add Stardew Valley",
          desc: "The gift and crop modules answer immediately -- no save required for reference questions.",
        },
        {
          title: "Point the daemon at your saves",
          desc: "Your 1.6 farm parses locally on save -- structured state, not screenshots, and the file never leaves your machine.",
        },
        {
          title: "Ask like a neighbor",
          desc: "Birthday gifts, crop economics, season planning -- answered from the game's data and, when connected, your actual farm.",
        },
      ],
    },
    {
      kind: "methodGrid",
      eyebrow: "METHODOLOGY",
      title: "We show our work",
      subtitle: "The game's data files, quoted rather than remembered.",
      treatment: "plain",
      items: [
        {
          source: "The game's own tables",
          desc: "Gift preferences and crop stats come from Stardew Valley's data files -- taste lists per villager, growth and regrowth days, sell prices, seed costs. If the game says Sebastian loves Frog Eggs, so do we.",
        },
        {
          source: "Your save, locally",
          desc: "Save parsing happens on your machine via the Savecraft daemon; only structured farm state is pushed. Stardew Valley 1.6+ only.",
        },
        {
          source: "Beta, honestly",
          desc: "This integration is in beta. If something in your farm parses oddly, it's a bug we want to hear about -- not a secret.",
        },
      ],
    },
  ],
  cta: {
    title: "Stop guessing what Sebastian loves.",
    sub: "Works with Claude and ChatGPT. Add Stardew Valley and the gift tables are already there.",
    label: "ADD STARDEW VALLEY",
  },
};
