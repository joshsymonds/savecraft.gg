<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ListGames from "./list-games.svelte";

  const { Story } = defineMeta({
    title: "Game State/ListGames",
    tags: ["autodocs"],
    parameters: { layout: "fullscreen" },
  });
</script>

<Story name="FullLibrary">
  <ListGames
    data={{
      games: [
        {
          game_id: "d2r",
          game_name: "Diablo II: Resurrected",
          icon_url: "https://api.savecraft.gg/plugins/d2r/icon.png",
          saves: [
            {
              save_id: "save-1",
              name: "Hammerdin",
              summary: "Level 92 Paladin — Hell Act 5",
              last_updated: "2m ago",
              notes: [
                { note_id: "n1", title: "Farming Goals" },
                { note_id: "n2", title: "Build Guide" },
              ],
            },
            {
              save_id: "save-2",
              name: "BlizzSorc",
              summary: "Level 89 Sorceress — Hell Act 3",
              last_updated: "1h ago",
              notes: [{ note_id: "n3", title: "MF Route" }],
            },
            {
              save_id: "save-3",
              name: "Fishymancer",
              summary: "Level 45 Necromancer — Nightmare Act 2",
              last_updated: "3d ago",
              notes: [],
            },
          ],
          removed_saves: ["OldBarb", "TestChar"],
          references: [
            {
              id: "drop_calc",
              name: "Drop Calculator",
              description:
                "Compute drop probabilities for any item from any farmable source, factoring Magic Find, player count, and treasure class",
            },
          ],
        },
        {
          game_id: "mtga",
          game_name: "Magic: The Gathering Arena",
          icon_url: "https://api.savecraft.gg/plugins/mtga/icon.png",
          saves: [
            {
              save_id: "save-4",
              name: "Collection",
              summary: "4,232 cards across 12 sets, 15 decks",
              last_updated: "5m ago",
              notes: [{ note_id: "n4", title: "Draft Strategy Notes" }],
            },
          ],
          references: [
            {
              id: "card_search",
              name: "Card Search",
              description: "Search Scryfall card database by name, oracle text, colors, type, format, rarity",
            },
            {
              id: "card_stats",
              name: "Card Stats",
              description: "Browse 17Lands draft statistics for sets, cards, and archetypes",
            },
            {
              id: "draft_advisor",
              name: "Draft Advisor",
              description:
                "Contextual draft pick evaluation using 8-axis WASPAS scoring across 31 color archetypes",
            },
            {
              id: "deckbuilding",
              name: "Deckbuilding",
              description: "Analyze deck health: mana curve, color pips, format legality",
            },
            {
              id: "collection_diff",
              name: "Collection Diff",
              description: "Calculate wildcard cost to complete a target decklist",
            },
            {
              id: "rules_search",
              name: "Rules Search",
              description: "Search MTG Comprehensive Rules and official card rulings",
            },
            {
              id: "match_stats",
              name: "Match Stats",
              description: "Personal Constructed match statistics by deck, format, and archetype",
            },
            {
              id: "play_advisor",
              name: "Play Advisor",
              description: "Per-turn gameplay analysis using 17Lands Premier Draft replay data",
            },
            {
              id: "sideboard_analysis",
              name: "Sideboard Analysis",
              description: "Analyze best-of-three match performance: games 1 vs 2/3 win rates",
            },
          ],
        },
        {
          game_id: "rimworld",
          game_name: "RimWorld",
          icon_url: "https://api.savecraft.gg/plugins/rimworld/icon.png",
          saves: [
            {
              save_id: "save-5",
              name: "Crashlanded",
              summary: "Randy Random, Losing is Fun — Year 3, 8 colonists",
              last_updated: "20m ago",
              notes: [],
            },
          ],
          references: [
            { id: "surgery", name: "Surgery", description: "Calculate true surgery success probability" },
            { id: "crops", name: "Crops", description: "Compute nutrition/day/tile for any crop on any soil" },
            { id: "combat", name: "Combat", description: "Compute ranged DPS at distance and melee true DPS" },
            {
              id: "materials",
              name: "Materials",
              description: "Look up final stats for any item-material-quality combo",
            },
            { id: "drugs", name: "Drugs", description: "Compute silver/day for drug production chains" },
            { id: "raids", name: "Raids", description: "Convert colony wealth to expected raid points" },
            { id: "genes", name: "Genes", description: "Validate xenogerm builds and detect gene conflicts" },
            {
              id: "research",
              name: "Research",
              description: "Traverse research prerequisite chains with total costs",
            },
          ],
        },
        {
          game_id: "sdv",
          game_name: "Stardew Valley",
          icon_url: "https://api.savecraft.gg/plugins/sdv/icon.png",
          saves: [
            {
              save_id: "save-6",
              name: "Berry Farm",
              summary: "Year 3 Fall — 2.4M gold, Community Center complete",
              last_updated: "2d ago",
              notes: [{ note_id: "n5", title: "Perfection Checklist" }],
            },
            {
              save_id: "save-7",
              name: "Wine Empire",
              summary: "Year 5 Spring — 8.1M gold, Joja route",
              last_updated: "1w ago",
              notes: [],
            },
          ],
          references: [
            { id: "gift_preferences", name: "Gift Preferences", description: "NPC gift preferences by villager or item" },
            {
              id: "crop_planner",
              name: "Crop Planner",
              description: "Crop growth, profitability, fertilizer effects, artisan goods values",
            },
          ],
        },
      ],
    }}
  />
</Story>

<Story name="SingleGameNoRefs">
  <ListGames
    data={{
      games: [
        {
          game_id: "clair-obscur",
          game_name: "Clair Obscur: Expedition 33",
          icon_url: "https://api.savecraft.gg/plugins/clair-obscur/icon.png",
          saves: [
            {
              save_id: "save-8",
              name: "Expedition 1",
              summary: "Chapter 3 — Level 24 party",
              last_updated: "10m ago",
              notes: [],
            },
          ],
        },
      ],
    }}
  />
</Story>

<Story name="BrokenIconFallback">
  <ListGames
    data={{
      games: [
        {
          game_id: "wow",
          game_name: "World of Warcraft",
          icon_url: "https://api.savecraft.gg/plugins/wow/BROKEN.png",
          saves: [
            {
              save_id: "save-9",
              name: "Thrallgar",
              summary: "Level 80 Orc Warrior — Mythic raider",
              last_updated: "4h ago",
              notes: [{ note_id: "n6", title: "Raid Consumables" }],
            },
          ],
          references: [],
        },
      ],
    }}
  />
</Story>

<Story name="WithRemovedSaves">
  <ListGames
    data={{
      games: [
        {
          game_id: "d2r",
          game_name: "Diablo II: Resurrected",
          icon_url: "https://api.savecraft.gg/plugins/d2r/icon.png",
          saves: [
            {
              save_id: "save-10",
              name: "Hammerdin",
              summary: "Level 92 Paladin",
              last_updated: "2m ago",
              notes: [],
            },
          ],
          removed_saves: ["OldBarb", "TestChar", "MuleAccount"],
          references: [
            {
              id: "drop_calc",
              name: "Drop Calculator",
              description: "Compute drop probabilities for any farmable source",
            },
          ],
        },
      ],
    }}
  />
</Story>

<Story name="Empty">
  <ListGames data={{ games: [] }} />
</Story>

<Story name="ManyNotes">
  <ListGames
    data={{
      games: [
        {
          game_id: "mtga",
          game_name: "Magic: The Gathering Arena",
          icon_url: "https://api.savecraft.gg/plugins/mtga/icon.png",
          saves: [
            {
              save_id: "save-11",
              name: "Collection",
              summary: "4,232 cards, 15 decks",
              last_updated: "5m ago",
              notes: [
                { note_id: "n10", title: "Draft Strategy" },
                { note_id: "n11", title: "Build Guide: Azorius Control" },
                { note_id: "n12", title: "Set Review: MKM" },
                { note_id: "n13", title: "Sideboard Guide" },
                { note_id: "n14", title: "Mana Base Notes" },
              ],
            },
          ],
          references: [
            { id: "card_search", name: "Card Search", description: "Search the card database" },
            { id: "draft_advisor", name: "Draft Advisor", description: "Evaluate draft picks" },
          ],
        },
      ],
    }}
  />
</Story>
