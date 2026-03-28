<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SearchSaves from "./search-saves.svelte";

  const { Story } = defineMeta({
    title: "Game State/SearchSaves",
    tags: ["autodocs"],
  });
</script>

<Story name="MixedResults">
  <SearchSaves
    data={{
      query: "Enigma",
      results: [
        {
          type: "section",
          save_id: "save-1",
          save_name: "Hammerdin",
          ref_id: "equipped_gear",
          ref_title: "Equipped Gear",
          snippet: "Body Armor: **Enigma** Mage Plate — +2 To All Skills, +45% Faster Run/Walk, +750-775 Defense...",
        },
        {
          type: "section",
          save_id: "save-1",
          save_name: "Hammerdin",
          ref_id: "inventory",
          ref_title: "Inventory",
          snippet: "...Jah Rune (1), Ith Rune (1), Ber Rune (1) — components for **Enigma** runeword...",
        },
        {
          type: "note",
          save_id: "save-1",
          save_name: "Hammerdin",
          ref_id: "note-1",
          ref_title: "Build Guide",
          snippet: "Target gear: **Enigma** for teleport. Farm Countess for Ith, LK for Jah/Ber...",
        },
        {
          type: "section",
          save_id: "save-2",
          save_name: "BlizzSorc",
          ref_id: "equipped_gear",
          ref_title: "Equipped Gear",
          snippet: "Body Armor: Vipermagi (no **Enigma** yet — farming Lower Kurast)...",
        },
      ],
    }}
  />
</Story>

<Story name="NotesOnly">
  <SearchSaves
    data={{
      query: "farming goals",
      results: [
        {
          type: "note",
          save_id: "save-1",
          save_name: "Hammerdin",
          ref_id: "note-2",
          ref_title: "Farming Goals",
          snippet: "Priority: Shako, War Travs, Arachnid Mesh. Current MF: 350%. **Farming** Ancient Tunnels...",
        },
        {
          type: "note",
          save_id: "save-3",
          save_name: "Berry Farm",
          ref_id: "note-3",
          ref_title: "Seasonal Goals",
          snippet: "Fall Year 3 **goals**: finish Community Center, **farm** ancient fruit in greenhouse...",
        },
      ],
    }}
  />
</Story>

<Story name="SaveDataOnly">
  <SearchSaves
    data={{
      query: "Lightning Bolt",
      results: [
        {
          type: "section",
          save_id: "save-4",
          save_name: "Collection",
          ref_id: "collection_summary",
          ref_title: "Collection Summary",
          snippet: "**Lightning Bolt** — Instant, R — **Lightning Bolt** deals 3 damage to any target. Owned: 4 copies...",
        },
        {
          type: "section",
          save_id: "save-4",
          save_name: "Collection",
          ref_id: "decks",
          ref_title: "Decks",
          snippet: "Mono Red Aggro: 4x **Lightning Bolt**, 4x Monastery Swiftspear, 4x Goblin Guide...",
        },
      ],
    }}
  />
</Story>

<Story name="SingleResult">
  <SearchSaves
    data={{
      query: "Shako",
      results: [
        {
          type: "section",
          save_id: "save-1",
          save_name: "Hammerdin",
          ref_id: "equipped_gear",
          ref_title: "Equipped Gear",
          snippet: "Helmet: Harlequin Crest (**Shako**) — +2 To All Skills, +1.5 Life Per Level, +1.5 Mana Per Level...",
        },
      ],
    }}
  />
</Story>

<Story name="NoResults">
  <SearchSaves
    data={{
      query: "nonexistent item name",
      results: [],
    }}
  />
</Story>
