<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameCard from "./GameCard.svelte";

  const { Story } = defineMeta({
    title: "Components/GameCard",
    tags: ["autodocs"],
  });
</script>

<Story name="Watching">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "Watching 3 saves",
        saves: [
          {
            saveUuid: "1",
            saveName: "Atmus",
            summary: "Level 74 Warlock",
            lastUpdated: "2m ago",
            status: "success",
          },
          {
            saveUuid: "2",
            saveName: "Bowazon",
            summary: "Level 89 Amazon",
            lastUpdated: "1h ago",
            status: "success",
          },
          {
            saveUuid: "3",
            saveName: "Hammerdin",
            summary: "Level 92 Paladin",
            lastUpdated: "3h ago",
            status: "success",
          },
        ],
      }}
      onclick={() => alert("Drill into D2R")}
    />
  </div>
</Story>

<Story name="WatchingNoSaves">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "watching",
        statusLine: "watching",
        saves: [],
      }}
      onclick={() => alert("Drill into D2R")}
    />
  </div>
</Story>

<Story name="Error">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "error",
        statusLine: "Parse failed",
        saves: [],
      }}
    />
  </div>
</Story>

<Story name="NotFound">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "bg3",
        name: "Baldur's Gate 3",
        status: "not_found",
        statusLine: "not installed",
        saves: [],
      }}
    />
  </div>
</Story>
