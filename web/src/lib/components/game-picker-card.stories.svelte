<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GamePickerCard from "./GamePickerCard.svelte";

  const { Story } = defineMeta({
    title: "Components/GamePickerCard",
    tags: ["autodocs"],
  });
</script>

<Story name="Watched">
  <div style="width: 480px;">
    <GamePickerCard
      game={{
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        iconUrl: "/plugins/d2r/icon.png",
        description: "Parses .d2s character saves and shared stash",
        watched: true,
        saveCount: 3,
        methods: ["daemon"],
      }}
      onclick={() => alert("Configure D2R")}
    />
  </div>
</Story>

<Story name="Unwatched">
  <div style="width: 480px;">
    <GamePickerCard
      game={{
        gameId: "sdv",
        name: "Stardew Valley",
        iconUrl: "/plugins/sdv/icon.png",
        description: "Farm saves, skills, relationships, collections",
        watched: false,
        saveCount: 0,
        defaultPaths: { linux: "~/.config/StardewValley/Saves" },
        methods: ["daemon"],
      }}
      onclick={() => alert("Add Stardew")}
    />
  </div>
</Story>

<Story name="WorkshopMod">
  <div style="width: 480px;">
    <GamePickerCard
      game={{
        gameId: "rimworld",
        name: "RimWorld",
        description: "In-game mod pushes full colony state on save",
        watched: false,
        saveCount: 0,
        workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=3693580596",
        methods: ["mod"],
      }}
      onclick={() => alert("Workshop install")}
    />
  </div>
</Story>

<Story name="Hover">
  <div style="width: 480px;">
    <GamePickerCard
      game={{
        gameId: "poe2",
        name: "Path of Exile 2",
        description: "Live characters — gear, gems, and passive tree via your GGG account",
        watched: false,
        saveCount: 0,
        methods: ["adapter"],
        isApiGame: true,
        adapter: { authProvider: "ggg", regions: ["poe2"] },
        sharedConnectGames: ["Path of Exile"],
      }}
    />
  </div>
</Story>
