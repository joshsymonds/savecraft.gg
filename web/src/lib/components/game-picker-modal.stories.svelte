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

  /** Never resolves — keeps the modal in "Connecting..." state. */
  function neverResolve(): Promise<void> {
    return new Promise(() => {});
  }

  /** Resolves after delay — triggers success state. */
  function succeedAfter(ms: number): () => Promise<void> {
    return () => new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Rejects after delay — triggers error state. */
  function failAfter(ms: number, message: string): () => Promise<void> {
    return () => new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
  }

  /** Rejects with timeout message. */
  function timeoutAfter(ms: number): () => Promise<void> {
    return () =>
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Daemon didn't respond — config saved but not yet validated")),
          ms,
        ),
      );
  }

  const noop = (): void => {};
</script>

<!-- Game catalog list -->
<Story name="FullCatalog">
  <div style="width: 560px; position: relative; height: 500px;">
    <GamePickerModal
      games={catalog}
      onselect={(g: PickerGame) => alert(`Selected: ${g.name}`)}
      onclose={() => alert("Close")}
    />
  </div>
</Story>

<!-- All games watched — no config forms available -->
<Story name="AllWatched">
  <div style="width: 560px; position: relative; height: 500px;">
    <GamePickerModal
      games={allWatched}
      onselect={(g: PickerGame) => alert(`Selected: ${g.name}`)}
      onclose={() => alert("Close")}
    />
  </div>
</Story>

<!-- Config form: connecting (click Stardew Valley, then "Connect Game") -->
<Story name="ConfigConnecting">
  <div style="width: 560px; position: relative; height: 350px;">
    <GamePickerModal games={catalog} onconfigure={neverResolve} onclose={noop} />
  </div>
</Story>

<!-- Config form: success after 800ms -->
<Story name="ConfigSuccess">
  <div style="width: 560px; position: relative; height: 350px;">
    <GamePickerModal games={catalog} onconfigure={succeedAfter(800)} onclose={noop} />
  </div>
</Story>

<!-- Config form: error after 1s -->
<Story name="ConfigError">
  <div style="width: 560px; position: relative; height: 350px;">
    <GamePickerModal
      games={catalog}
      onconfigure={failAfter(1000, "path not found: ~/.config/StardewValley/Saves")}
      onclose={noop}
    />
  </div>
</Story>

<!-- Config form: timeout after 2s (shortened for demo) -->
<Story name="ConfigTimeout">
  <div style="width: 560px; position: relative; height: 350px;">
    <GamePickerModal games={catalog} onconfigure={timeoutAfter(2000)} onclose={noop} />
  </div>
</Story>
