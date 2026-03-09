<script module>
  import { setPlugins } from "$lib/stores/plugins";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import EmptySourceState from "./EmptySourceState.svelte";

  setPlugins({
    d2r: {
      game_id: "d2r",
      name: "Diablo II: Resurrected",
      version: "",
      file_extensions: [".d2s", ".d2i"],
      default_paths: {},
      coverage: "partial",
      icon_url: "/plugins/d2r/icon.png",
    },
    sdv: {
      game_id: "sdv",
      name: "Stardew Valley",
      version: "",
      file_extensions: [],
      default_paths: {},
      coverage: "partial",
      icon_url: "/plugins/sdv/icon.png",
    },
    wow: {
      game_id: "wow",
      name: "World of Warcraft",
      version: "",
      file_extensions: [],
      default_paths: {},
      coverage: "partial",
      icon_url: "/plugins/wow/icon.png",
      adapter: { authProvider: "battlenet", regions: ["us", "eu", "kr", "tw"] },
    },
  });

  const { Story } = defineMeta({
    title: "Components/EmptySourceState",
    tags: ["autodocs"],
  });
</script>

<!-- Retro terminal boot screen shown when no sources are connected -->
<Story name="Default">
  <div
    style="height: 100vh; background: var(--color-bg, #05071a); display: flex; align-items: center; justify-content: center;"
  >
    <EmptySourceState
      onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)}
      onapiskip={() => alert("Skip to game catalog")}
    />
  </div>
</Story>
