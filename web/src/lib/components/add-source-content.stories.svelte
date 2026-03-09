<script module>
  import { setPlugins } from "$lib/stores/plugins";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import AddSourceContent from "./AddSourceContent.svelte";
  import Panel from "./Panel.svelte";

  // Seed plugin store so GameIcon tiles render real icons
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
    title: "Components/AddSourceContent",
    tags: ["autodocs"],
  });
</script>

<!-- Default: install + pairing content inside a Panel -->
<Story name="Default">
  <div style="width: 520px;">
    <Panel>
      <AddSourceContent onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)} />
    </Panel>
  </div>
</Story>

<!-- Split layout: daemon on left, API on right -->
<Story name="SplitWithApi">
  <div style="width: 680px;">
    <Panel>
      <AddSourceContent
        onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)}
        onapiskip={() => alert("Browse API games")}
      />
    </Panel>
  </div>
</Story>

<!-- Narrow: how it looks in a tighter container (e.g. empty state card) -->
<Story name="Narrow">
  <div style="width: 400px;">
    <Panel>
      <AddSourceContent onsubmit={(code) => alert(`Pairing with code: ${String(code)}`)} />
    </Panel>
  </div>
</Story>
