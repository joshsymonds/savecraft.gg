<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GetSave from "./get-save.svelte";

  const { Story } = defineMeta({
    title: "Game State/GetSave",
    tags: ["autodocs"],
  });
</script>

<Story name="FullCharacter">
  <GetSave
    data={{
      save_id: "save-1",
      game_id: "d2r",
      game_name: "Diablo II: Resurrected",
      name: "Hammerdin",
      summary: "Level 92 Paladin — Hell Act 5",
      icon_url: "https://api.savecraft.gg/plugins/d2r/icon.png",
      overview: {
        name: "Hammerdin",
        class: "Paladin",
        level: 92,
        difficulty: "Hell",
        act: 5,
        experience: "2,847,392,000",
        gold: "2,500,000",
      },
      sections: [
        { name: "character_overview", description: "Level, class, difficulty, play time" },
        { name: "equipped_gear", description: "All equipped items with stats, sockets, runewords" },
        { name: "skills", description: "Skill point allocation by tree" },
        { name: "inventory", description: "Items in inventory and stash" },
        { name: "mercenary", description: "Mercenary equipment and stats" },
        { name: "quest_progress", description: "Quest completion status per act and difficulty" },
        { name: "waypoints", description: "Unlocked waypoints per difficulty" },
      ],
      notes: [
        { note_id: "n1", title: "Farming Goals", source: "ai", size_bytes: 2048 },
        { note_id: "n2", title: "Build Guide: Hammerdin", source: "player", size_bytes: 8192 },
        { note_id: "n3", title: "Session Notes — MF Runs", source: "ai", size_bytes: 1024 },
      ],
    }}
  />
</Story>

<Story name="MTGACollection">
  <GetSave
    data={{
      save_id: "save-2",
      game_id: "mtga",
      game_name: "Magic: The Gathering Arena",
      name: "Collection",
      summary: "4,232 cards across 12 sets, 15 decks",
      icon_url: "https://api.savecraft.gg/plugins/mtga/icon.png",
      overview: {
        total_cards: 4232,
        unique_cards: 2891,
        sets_collected: 12,
        decks: 15,
        wildcards_common: 42,
        wildcards_uncommon: 28,
        wildcards_rare: 8,
        wildcards_mythic: 3,
      },
      sections: [
        { name: "player_summary", description: "Account overview, currency, rank" },
        { name: "collection_summary", description: "Card counts by set and rarity" },
        { name: "decks", description: "All saved decks with card lists" },
        { name: "draft_history", description: "Recent draft results and picks" },
        { name: "match_history", description: "Recent match results" },
      ],
      notes: [
        { note_id: "n4", title: "Draft Strategy Notes", source: "ai", size_bytes: 4096 },
      ],
    }}
  />
</Story>

<Story name="NoNotes">
  <GetSave
    data={{
      save_id: "save-3",
      game_id: "rimworld",
      game_name: "RimWorld",
      name: "Crashlanded",
      summary: "Randy Random, Losing is Fun — Year 3, 8 colonists",
      icon_url: "https://api.savecraft.gg/plugins/rimworld/icon.png",
      overview: {
        colony_name: "Crashlanded",
        storyteller: "Randy Random",
        difficulty: "Losing is Fun",
        year: 3,
        colonists: 8,
        colony_wealth: 245000,
      },
      sections: [
        { name: "overview", description: "Colony summary, storyteller, difficulty" },
        { name: "colonists", description: "All colonist stats, skills, traits, health" },
        { name: "buildings", description: "Colony layout and building inventory" },
        { name: "research", description: "Completed and available research" },
      ],
      notes: [],
    }}
  />
</Story>

<Story name="NoOverview">
  <GetSave
    data={{
      save_id: "save-4",
      game_id: "clair-obscur",
      game_name: "Clair Obscur: Expedition 33",
      name: "Expedition 1",
      summary: "Chapter 3 — Level 24 party",
      icon_url: "https://api.savecraft.gg/plugins/clair-obscur/icon.png",
      overview: null,
      sections: [
        { name: "party", description: "Party members, levels, and equipment" },
        { name: "inventory", description: "Items and consumables" },
      ],
      notes: [],
    }}
  />
</Story>

<Story name="AdapterRefreshError">
  <GetSave
    data={{
      save_id: "save-5",
      game_id: "wow",
      game_name: "World of Warcraft",
      name: "Thrallgar",
      summary: "Level 80 Orc Warrior — Mythic raider",
      icon_url: "https://api.savecraft.gg/plugins/wow/icon.png",
      overview: {
        name: "Thrallgar",
        race: "Orc",
        class: "Warrior",
        level: 80,
        realm: "Illidan",
        item_level: 489,
      },
      sections: [
        { name: "character_overview", description: "Name, race, class, level, realm" },
        { name: "equipment", description: "All equipped gear with item level" },
        { name: "talents", description: "Talent specialization and choices" },
        { name: "mythic_plus", description: "Mythic+ score and dungeon bests" },
        { name: "raid_progress", description: "Current tier raid progress" },
      ],
      notes: [
        { note_id: "n5", title: "Raid Consumables", source: "player", size_bytes: 512 },
      ],
      refresh_status: "error",
      refresh_error: "token_expired: Battle.net token has expired. Player needs to reconnect on savecraft.gg.",
    }}
  />
</Story>

<Story name="AdapterRefreshOk">
  <GetSave
    data={{
      save_id: "save-6",
      game_id: "wow",
      game_name: "World of Warcraft",
      name: "Moonfire",
      summary: "Level 80 Night Elf Druid — M+ Healer",
      icon_url: "https://api.savecraft.gg/plugins/wow/icon.png",
      overview: {
        name: "Moonfire",
        race: "Night Elf",
        class: "Druid",
        level: 80,
        realm: "Stormrage",
        item_level: 476,
      },
      sections: [
        { name: "character_overview", description: "Name, race, class, level, realm" },
        { name: "equipment", description: "All equipped gear with item level" },
        { name: "talents", description: "Talent specialization and choices" },
      ],
      notes: [],
      refresh_status: "ok",
    }}
  />
</Story>
