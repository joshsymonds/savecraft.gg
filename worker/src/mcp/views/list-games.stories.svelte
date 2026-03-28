<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ListGames from "./list-games.svelte";

  const { Story } = defineMeta({
    title: "Game State/ListGames",
    tags: ["autodocs"],
  });
</script>

<Story name="MultipleGames">
  <ListGames
    data={{
      games: [
        {
          game_id: "d2r",
          game_name: "Diablo II: Resurrected",
          saves: [
            { save_name: "Hammerdin", summary: "Level 92 Paladin", last_updated: "2m ago" },
            { save_name: "BlizzSorc", summary: "Level 89 Sorceress", last_updated: "1h ago" },
          ],
        },
        {
          game_id: "mtga",
          game_name: "Magic: The Gathering Arena",
          saves: [
            {
              save_name: "Collection",
              summary: "4,232 cards, 12 decks",
              last_updated: "5m ago",
            },
          ],
        },
      ],
    }}
  />
</Story>

<Story name="SingleGame">
  <ListGames
    data={{
      games: [
        {
          game_id: "d2r",
          game_name: "Diablo II: Resurrected",
          saves: [
            { save_name: "Atmus", summary: "Level 74 Warlock", last_updated: "3h ago" },
          ],
        },
      ],
    }}
  />
</Story>

<Story name="Empty">
  <ListGames data={{ games: [] }} />
</Story>
