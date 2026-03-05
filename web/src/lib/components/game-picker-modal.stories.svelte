<script module lang="ts">
  import type { PickerGame } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GamePickerModal from "./GamePickerModal.svelte";

  const { Story } = defineMeta({
    title: "Components/GamePickerModal",
    tags: ["autodocs"],
  });

  const catalog: PickerGame[] = [
    {
      gameId: "d2r",
      name: "Diablo II: Resurrected",
      description: "Parses .d2s character saves and shared stash",
      watched: true,
      saveCount: 3,
      defaultPaths: {
        linux: "~/.local/share/Diablo II Resurrected/Save",
        windows: "%UserProfile%/Saved Games/Diablo II Resurrected",
      },
    },
    {
      gameId: "sdv",
      name: "Stardew Valley",
      description: "Farm saves, skills, relationships, collections",
      watched: false,
      saveCount: 0,
      defaultPaths: {
        linux: "~/.config/StardewValley/Saves",
        windows: "%AppData%/StardewValley/Saves",
      },
    },
    {
      gameId: "poe2",
      name: "Path of Exile 2",
      description: "Character builds, atlas progress, stash contents",
      watched: false,
      saveCount: 0,
    },
    {
      gameId: "bg3",
      name: "Baldur's Gate 3",
      description: "Party composition, quest progress, inventory",
      watched: false,
      saveCount: 0,
      defaultPaths: {
        linux: "~/.local/share/Larian Studios/Baldur's Gate 3/PlayerProfiles",
        windows: "%LocalAppData%/Larian Studios/Baldur's Gate 3/PlayerProfiles",
      },
    },
  ];

  const allWatched: PickerGame[] = catalog.map((g, index) => ({
    ...g,
    watched: true,
    saveCount: index + 1,
  }));
</script>

<!-- Render inline (not as a true overlay) so Storybook can show it -->
<Story name="FullCatalog">
  <div style="width: 560px; position: relative; height: 500px;">
    <GamePickerModal
      games={catalog}
      onselect={(g: PickerGame) => alert(`Selected: ${g.name}`)}
      onconfigure={(gameId: string, path: string) => alert(`Configure: ${gameId} at ${path}`)}
      onclose={() => alert("Close")}
    />
  </div>
</Story>

<Story name="AllWatched">
  <div style="width: 560px; position: relative; height: 500px;">
    <GamePickerModal
      games={allWatched}
      onselect={(g: PickerGame) => alert(`Selected: ${g.name}`)}
      onconfigure={(gameId: string, path: string) => alert(`Configure: ${gameId} at ${path}`)}
      onclose={() => alert("Close")}
    />
  </div>
</Story>
