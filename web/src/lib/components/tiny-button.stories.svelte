<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";
  import TinyButton from "./TinyButton.svelte";

  const { Story } = defineMeta({
    title: "Components/TinyButton",
    tags: ["autodocs"],
  });
</script>

<Story name="Single">
  <div style="width: 340px;">
    <Panel>
      <div style="padding: 20px 24px; display: flex; align-items: center; gap: 16px;">
        <span
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-text-dim); letter-spacing: 1px;"
          >ACTION:</span
        >
        <TinyButton label="RESCAN" />
      </div>
    </Panel>
  </div>
</Story>

<Story name="Toolbar">
  <div style="width: 480px;">
    <Panel>
      <div
        style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(5,7,26,0.4); border-bottom: 1px solid rgba(74,90,173,0.12);"
      >
        <div style="display: flex; align-items: center; gap: 8px;">
          <span
            style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text); letter-spacing: 0.5px;"
            >STEAM-DECK</span
          >
          <span
            style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-dim);"
            >SteamOS 3.5</span
          >
        </div>
        <div style="display: flex; gap: 5px;">
          <TinyButton label="RESCAN" />
          <TinyButton label="CONFIG" />
        </div>
      </div>
      <div
        style="padding: 16px; font-family: var(--font-body); font-size: 18px; color: var(--color-text-muted);"
      >
        Toolbar buttons shown in a source title bar context.
      </div>
    </Panel>
  </div>
</Story>

<Story name="AllActions">
  <div style="width: 360px;">
    <Panel>
      <div style="padding: 20px 24px;">
        <div
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 16px;"
        >
          AVAILABLE ACTIONS
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          {#each ["RESCAN", "CONFIG", "SYNC", "LOGS", "DELETE", "EXPORT"] as label (label)}
            <TinyButton {label} />
          {/each}
        </div>
      </div>
    </Panel>
  </div>
</Story>
