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
      }}
      onclick={() => alert("Add Stardew")}
    />
  </div>
</Story>

<Story name="Hover">
  <div style="width: 480px;">
    <GamePickerCard
      game={{
        gameId: "poe2",
        name: "Path of Exile 2",
        description: "Character builds, atlas progress, stash contents",
        watched: false,
        saveCount: 0,
      }}
    />
  </div>
</Story>
