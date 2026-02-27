<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import Panel from "./Panel.svelte";
  import StatusDot from "./StatusDot.svelte";
  import TinyButton from "./TinyButton.svelte";

  const { Story } = defineMeta({
    title: "Components/Panel",
    component: Panel,
    tags: ["autodocs"],
  });
</script>

<!-- Default panel with simple content -->
<Story name="Default">
  <div style="width: 460px;">
    <Panel>
      <div style="padding: 16px;">
        <div
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-gold); letter-spacing: 2px; margin-bottom: 12px;"
        >
          ACTIVITY
        </div>
        <div
          style="font-family: var(--font-body); font-size: 20px; color: var(--color-text); line-height: 1.4;"
        >
          No devices connected yet. Install the Savecraft daemon on your gaming PC or Steam Deck to
          get started.
        </div>
      </div>
    </Panel>
  </div>
</Story>

<!-- Device card — online Steam Deck -->
<Story name="DeviceCard">
  <div style="width: 520px;">
    <Panel accent="#5abe8a40">
      <!-- Title bar -->
      <div
        style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(5,7,26,0.4); border-bottom: 1px solid rgba(74,90,173,0.12); min-height: 52px;"
      >
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-pixel); font-size: 14px; color: var(--color-green);"
            >*</span
          >
          <div>
            <div style="display: flex; align-items: center; gap: 7px;">
              <span
                style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text); letter-spacing: 0.5px;"
                >STEAM-DECK</span
              >
              <StatusDot status="online" size={7} />
            </div>
            <span
              style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);"
              >SteamOS 3.5 · v0.1.0</span
            >
          </div>
        </div>
        <div style="display: flex; gap: 5px;">
          <TinyButton label="RESCAN" />
          <TinyButton label="CONFIG" />
        </div>
      </div>

      <!-- Game grid -->
      <div style="padding: 14px 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        {#each [{ icon: "D", name: "D2R", status: "watching", statusLine: "3 characters", color: "var(--color-green)" }, { icon: "S", name: "STARDEW", status: "watching", statusLine: "1 farm", color: "var(--color-green)" }, { icon: "X", name: "STELLARIS", status: "watching", statusLine: "2 empires", color: "var(--color-green)" }, { icon: "B", name: "BG3", status: "not found", statusLine: "not installed", color: "var(--color-text-muted)" }] as game (game.name)}
          <div
            style="display: flex; flex-direction: column; align-items: center; padding: 12px 10px; border-radius: 4px; background: rgba(74,90,173,0.03); border: 1px solid rgba(74,90,173,0.06); min-width: 110px; opacity: {game.status ===
            'not found'
              ? '0.3'
              : '1'};"
          >
            <span
              style="font-family: var(--font-pixel); font-size: 18px; margin-bottom: 6px; color: var(--color-gold-light);"
              >{game.icon}</span
            >
            <span
              style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-text-dim); letter-spacing: 0.5px; margin-bottom: 4px;"
              >{game.name}</span
            >
            <span style="font-family: var(--font-body); font-size: 15px; color: {game.color};"
              >{game.statusLine}</span
            >
          </div>
        {/each}
      </div>
    </Panel>
  </div>
</Story>

<!-- Offline device -->
<Story name="OfflineDevice">
  <div style="width: 520px;">
    <Panel>
      <div
        style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(5,7,26,0.4); border-bottom: 1px solid rgba(74,90,173,0.12); min-height: 52px;"
      >
        <div style="display: flex; align-items: center; gap: 8px;">
          <span
            style="font-family: var(--font-pixel); font-size: 14px; color: var(--color-text-muted);"
            >#</span
          >
          <div>
            <div style="display: flex; align-items: center; gap: 7px;">
              <span
                style="font-family: var(--font-pixel); font-size: 9px; color: var(--color-text); letter-spacing: 0.5px;"
                >DESKTOP-PC</span
              >
              <StatusDot status="offline" size={7} />
            </div>
            <span
              style="font-family: var(--font-body); font-size: 15px; color: var(--color-text-dim);"
              >Windows 11 · v0.1.0 · last seen 3 hours ago</span
            >
          </div>
        </div>
        <div style="display: flex; gap: 5px;">
          <TinyButton label="RESCAN" />
          <TinyButton label="CONFIG" />
        </div>
      </div>

      <div style="padding: 14px 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        {#each [{ icon: "D", name: "D2R", statusLine: "2 characters", color: "var(--color-green)" }, { icon: "E", name: "ELDEN RING", statusLine: "1 tarnished", color: "var(--color-blue)" }, { icon: "S", name: "SKYRIM", statusLine: "5 characters", color: "var(--color-green)" }, { icon: "F", name: "FALLOUT", statusLine: "parse error", color: "var(--color-yellow)" }] as game (game.name)}
          <div
            style="display: flex; flex-direction: column; align-items: center; padding: 12px 10px; border-radius: 4px; background: rgba(74,90,173,0.03); border: 1px solid rgba(74,90,173,0.06); min-width: 110px;"
          >
            <span
              style="font-family: var(--font-pixel); font-size: 18px; margin-bottom: 6px; color: var(--color-gold-light);"
              >{game.icon}</span
            >
            <span
              style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-text-dim); letter-spacing: 0.5px; margin-bottom: 4px;"
              >{game.name}</span
            >
            <span style="font-family: var(--font-body); font-size: 15px; color: {game.color};"
              >{game.statusLine}</span
            >
          </div>
        {/each}
      </div>
    </Panel>
  </div>
</Story>

<!-- Accent variants -->
<Story name="GreenAccent">
  <div style="width: 300px;">
    <Panel accent="#5abe8a40">
      <div style="padding: 16px;">
        <div
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-green); letter-spacing: 1px; margin-bottom: 8px;"
        >
          * CONNECTED
        </div>
        <div style="font-family: var(--font-body); font-size: 18px; color: var(--color-text);">
          Device is online and syncing saves.
        </div>
      </div>
    </Panel>
  </div>
</Story>

<Story name="RedAccent">
  <div style="width: 300px;">
    <Panel accent="#e85a5a40">
      <div style="padding: 16px;">
        <div
          style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-red); letter-spacing: 1px; margin-bottom: 8px;"
        >
          ! ERROR
        </div>
        <div style="font-family: var(--font-body); font-size: 18px; color: var(--color-text);">
          Plugin crash — parser returned malformed JSON
        </div>
      </div>
    </Panel>
  </div>
</Story>
