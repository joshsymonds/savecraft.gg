<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import WindowTitleBar from "./WindowTitleBar.svelte";

  const { Story } = defineMeta({
    title: "Components/WindowTitleBar",
    tags: ["autodocs"],
  });
</script>

<Story name="SourceLevel">
  <div style="width: 700px; background: var(--color-panel-bg);">
    <WindowTitleBar
      activeIcon="🖥"
      activeLabel="DESKTOP-PC"
      activeSublabel="Windows 11 · v0.1.0"
      statusDot="online"
    />
  </div>
</Story>

<Story name="GameLevel">
  <div style="width: 700px; background: var(--color-panel-bg);">
    <WindowTitleBar
      parents={[{ icon: "🖥", label: "DESKTOP-PC", onclick: () => alert("back to source") }]}
      activeIcon="⚔"
      activeLabel="Diablo II: Resurrected"
      activeSublabel="3 characters loaded"
    />
  </div>
</Story>

<Story name="SaveLevel">
  <div style="width: 700px; background: var(--color-panel-bg);">
    <WindowTitleBar
      parents={[
        { icon: "🖥", label: "DESKTOP-PC", onclick: () => alert("back to source") },
        { icon: "⚔", label: "D2R", onclick: () => alert("back to game") },
      ]}
      activeLabel="Hammerdin"
      activeSublabel="Paladin · Level 89 · Hell"
    />
  </div>
</Story>

<Story name="OfflineSource">
  <div style="width: 700px; background: var(--color-panel-bg);">
    <WindowTitleBar
      activeIcon="🖥"
      activeLabel="DESKTOP-PC"
      activeSublabel="Windows 11 · v0.1.0 · last seen 3 hours ago"
      statusDot="offline"
    />
  </div>
</Story>
