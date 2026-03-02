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
          { saveUuid: "1", saveName: "Atmus", summary: "Level 74 Warlock", lastUpdated: "2m ago" },
          {
            saveUuid: "2",
            saveName: "Bowazon",
            summary: "Level 89 Amazon",
            lastUpdated: "1h ago",
          },
          {
            saveUuid: "3",
            saveName: "Hammerdin",
            summary: "Level 92 Paladin",
            lastUpdated: "3h ago",
          },
        ],
      }}
    />
  </div>
</Story>

<Story name="Detected">
  <div style="width: 200px;">
    <GameCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "detected",
        statusLine: "Detected",
        saves: [],
      }}
      onactivate={(gameId) => alert(`Activate ${String(gameId)}`)}
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
        gameId: "stardew",
        name: "Stardew Valley",
        status: "not_found",
        statusLine: "Not installed",
        saves: [],
      }}
    />
  </div>
</Story>
