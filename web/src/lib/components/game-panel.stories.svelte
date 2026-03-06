<script module lang="ts">
  import type { Game } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GamePanel from "./GamePanel.svelte";

  const { Story } = defineMeta({
    title: "Components/GamePanel",
    tags: ["autodocs"],
  });

  const multiSourceGames: Game[] = [
    {
      gameId: "d2r",
      name: "Diablo II: Resurrected",
      statusLine: "3 characters",
      sourceCount: 2,
      saves: [
        {
          saveUuid: "s1",
          saveName: "Hammerdin",
          summary: "Paladin · Level 89 · Hell",
          lastUpdated: "2m ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s2",
          saveName: "BlizzSorc",
          summary: "Sorceress · Level 76 · Nightmare",
          lastUpdated: "1d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s7",
          saveName: "Hammerdin",
          summary: "Paladin · Level 89 · Hell",
          lastUpdated: "3h ago",
          status: "success",
          sourceId: "desktop-pc",
          sourceName: "DESKTOP-PC",
        },
      ],
    },
    {
      gameId: "stardew",
      name: "Stardew Valley",
      statusLine: "1 farm found",
      sourceCount: 1,
      saves: [
        {
          saveUuid: "s4",
          saveName: "Sunrise Farm — Luna",
          summary: "Year 3 · Fall · 64% Perfection",
          lastUpdated: "4h ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
      ],
    },
    {
      gameId: "stellaris",
      name: "Stellaris",
      statusLine: "2 empires found",
      sourceCount: 1,
      saves: [
        {
          saveUuid: "s5",
          saveName: "United Nations of Earth",
          summary: "Year 2340 · Federation Builder",
          lastUpdated: "2d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
        {
          saveUuid: "s6",
          saveName: "Tzynn Empire",
          summary: "Year 2280 · Militarist Xenophobe",
          lastUpdated: "5d ago",
          status: "success",
          sourceId: "steam-deck",
          sourceName: "STEAM-DECK",
        },
      ],
    },
  ];

  const singleSourceGames: Game[] = multiSourceGames.map((g) => ({
    ...g,
    sourceCount: 1,
  }));

  const emptyGames: Game[] = [];
</script>

<!-- Multi-source: multiple games in grid -->
<Story name="MultipleGames">
  <div style="width: 700px;">
    <GamePanel
      games={multiSourceGames}
      onadd={() => alert("Add a game")}
      ongameclick={(game) => console.log("Game clicked:", game.name)}
    />
  </div>
</Story>

<!-- Single source -->
<Story name="SingleSource">
  <div style="width: 700px;">
    <GamePanel
      games={singleSourceGames}
      onadd={() => alert("Add a game")}
      ongameclick={(game) => console.log("Game clicked:", game.name)}
    />
  </div>
</Story>

<!-- No games: prominent add button -->
<Story name="Empty">
  <div style="width: 700px;">
    <GamePanel games={emptyGames} onadd={() => alert("Add a game")} />
  </div>
</Story>
