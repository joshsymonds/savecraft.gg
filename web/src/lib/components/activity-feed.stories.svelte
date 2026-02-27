<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ActivityEvent from "./ActivityEvent.svelte";
  import StatusDot from "./StatusDot.svelte";

  const { Story } = defineMeta({
    title: "Composed/ActivityFeed",
    tags: ["autodocs"],
  });

  const events = [
    {
      type: "parse_success",
      message: "Parsed Hammerdin — 42KB",
      detail: "Level 89 Paladin · Hell",
      time: "now",
    },
    {
      type: "plugin_updated",
      message: "D2R plugin updated to v1.2.0",
      time: "3s",
    },
    {
      type: "watching",
      message: "Re-watching 5 files in D2R saves",
      time: "5s",
    },
    {
      type: "parse_success",
      message: "Parsed Sunrise Farm — Luna (18KB)",
      detail: "Year 3 · Fall 14 · 64% Perfection",
      time: "4h",
    },
    {
      type: "daemon_online",
      message: "STEAM-DECK connected",
      detail: "v0.1.0 · SteamOS 3.5",
      time: "4h",
    },
    {
      type: "parse_error",
      message: "SharedStash.d2i — unsupported format",
      detail: "version 0x62",
      time: "4h",
    },
    {
      type: "daemon_offline",
      message: "DESKTOP-PC disconnected",
      time: "3h",
    },
    {
      type: "parse_success",
      message: "Parsed Dovahkiin (86KB)",
      detail: "Nord · Level 52",
      time: "6h",
    },
    {
      type: "parse_success",
      message: "Parsed Tarnished (124KB)",
      detail: "Level 145 · NG+",
      time: "1d",
    },
    {
      type: "config_push",
      message: "Config pushed to DESKTOP-PC",
      time: "1d",
    },
  ];
</script>

<Story name="Default">
  <div
    style="width: 340px; border-left: 1px solid rgba(74,90,173,0.12); background: rgba(5,7,26,0.3); display: flex; flex-direction: column; height: 600px;"
  >
    <div
      style="padding: 16px 18px; border-bottom: 1px solid rgba(74,90,173,0.12); display: flex; justify-content: space-between; align-items: center;"
    >
      <span
        style="font-family: var(--font-pixel); font-size: 7px; color: var(--color-gold); letter-spacing: 2px;"
        >ACTIVITY</span
      >
      <span
        style="font-family: var(--font-pixel); font-size: 6px; color: var(--color-green); display: flex; align-items: center; gap: 5px;"
      >
        <StatusDot status="online" size={5} /> LIVE
      </span>
    </div>
    <div style="flex: 1; overflow: auto;">
      {#each events as event, index (event.message)}
        <ActivityEvent {...event} isNew={index === 0} />
      {/each}
    </div>
  </div>
</Story>
