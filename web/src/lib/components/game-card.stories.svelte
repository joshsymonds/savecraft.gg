<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameCard from "./GameCard.svelte";

  const { Story } = defineMeta({
    title: "Components/GameCard",
    tags: ["autodocs"],
  });
</script>

<Story name="WithSaves">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        iconUrl: "/plugins/d2r/icon.png",
        statusLine: "3 saves",
        sourceCount: 1,
        saves: [
          {
            saveUuid: "1",
            saveName: "Atmus",
            summary: "Level 74 Warlock",
            lastUpdated: "2m ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "2",
            saveName: "Bowazon",
            summary: "Level 89 Amazon",
            lastUpdated: "1h ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "3",
            saveName: "Hammerdin",
            summary: "Level 92 Paladin",
            lastUpdated: "3h ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
        ],
      }}
      onclick={() => alert("Drill into D2R")}
    />
  </div>
</Story>

<Story name="ManySaves">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        iconUrl: "/plugins/d2r/icon.png",
        statusLine: "6 saves",
        sourceCount: 1,
        saves: [
          {
            saveUuid: "1",
            saveName: "Hammerdin",
            summary: "Level 92 Paladin",
            lastUpdated: "2m ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "2",
            saveName: "BlizzSorc",
            summary: "Level 89 Sorceress",
            lastUpdated: "1h ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "3",
            saveName: "Trapsin",
            summary: "Level 85 Assassin",
            lastUpdated: "3h ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "4",
            saveName: "Javazon",
            summary: "Level 78 Amazon",
            lastUpdated: "1d ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "5",
            saveName: "Summonmancer",
            summary: "Level 82 Necromancer",
            lastUpdated: "2d ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
          {
            saveUuid: "6",
            saveName: "Wind Druid",
            summary: "Level 71 Druid",
            lastUpdated: "5d ago",
            status: "success",
            sourceId: "src-1",
            sourceName: "STEAM-DECK",
          },
        ],
      }}
      onclick={() => alert("Drill into D2R")}
    />
  </div>
</Story>

<Story name="NoSaves">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        iconUrl: "/plugins/d2r/icon.png",
        statusLine: "No saves",
        sourceCount: 1,
        saves: [],
      }}
      onclick={() => alert("Drill into D2R")}
    />
  </div>
</Story>
