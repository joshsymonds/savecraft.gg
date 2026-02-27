<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ActivityEvent from "./ActivityEvent.svelte";
  import StatusDot from "./StatusDot.svelte";

  const { Story } = defineMeta({
    title: "Composed/ActivityTracker",
    tags: ["autodocs"],
  });

  /** Successful character parse: Atmus.d2s → push complete. */
  const characterParse = [
    {
      type: "parse_started",
      message: "Parsing Atmus.d2s",
      detail: "d2r",
      time: "now",
    },
    {
      type: "plugin_status",
      message: "Character: Atmus, Level 74 Warlock",
      detail: "Atmus.d2s",
      time: "now",
    },
    {
      type: "plugin_status",
      message: "45 items, 4 socketed",
      detail: "Atmus.d2s",
      time: "now",
    },
    {
      type: "parse_completed",
      message: "Atmus, Level 74 Warlock (Hell)",
      detail: "6 sections · 48KB",
      time: "now",
    },
    {
      type: "push_started",
      message: "Uploading Atmus, Level 74 Warlock (Hell)",
      detail: "48KB",
      time: "now",
    },
    {
      type: "push_completed",
      message: "Atmus, Level 74 Warlock (Hell)",
      detail: "48KB · 340ms",
      time: "now",
    },
  ];

  /** Successful shared stash parse: .d2i → push complete. */
  const stashParse = [
    {
      type: "parse_started",
      message: "Parsing ModernSharedStashSoftCoreV2.d2i",
      detail: "d2r",
      time: "2m",
    },
    {
      type: "plugin_status",
      message: "Shared stash, 7 sections, RotW v105",
      detail: "ModernSharedStashSoftCoreV2.d2i",
      time: "2m",
    },
    {
      type: "plugin_status",
      message: "60 items across 6 tabs",
      detail: "ModernSharedStashSoftCoreV2.d2i",
      time: "2m",
    },
    {
      type: "parse_completed",
      message: "Shared Stash (Softcore), 60 items, 0 gold",
      detail: "3 sections · 12KB",
      time: "2m",
    },
    {
      type: "push_started",
      message: "Uploading Shared Stash (Softcore)",
      detail: "12KB",
      time: "2m",
    },
    {
      type: "push_completed",
      message: "Shared Stash (Softcore), 60 items",
      detail: "12KB · 180ms",
      time: "2m",
    },
  ];

  /** Failed parse: Corrupt.d2s hits item bitstream error. */
  const failedParse = [
    {
      type: "parse_started",
      message: "Parsing Corrupt.d2s",
      detail: "d2r",
      time: "5m",
    },
    {
      type: "plugin_status",
      message: "Character: SomeGuy, Level 12 Amazon",
      detail: "Corrupt.d2s",
      time: "5m",
    },
    {
      type: "parse_failed",
      message: "Corrupt.d2s — corrupt file",
      detail: "item 12: unexpected end of bitstream",
      time: "5m",
    },
  ];

  /** Full timeline: character parse, then stash parse, then a failed parse — newest first. */
  const fullTimeline = [...characterParse, ...stashParse, ...failedParse];
</script>

<Story name="CharacterParse">
  <div
    style="width: 380px; border-left: 1px solid rgba(74,90,173,0.12); background: rgba(5,7,26,0.3); display: flex; flex-direction: column; height: 500px;"
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
      {#each characterParse as event, index (index)}
        <ActivityEvent {...event} isNew={index === 0} />
      {/each}
    </div>
  </div>
</Story>

<Story name="StashParse">
  <div
    style="width: 380px; border-left: 1px solid rgba(74,90,173,0.12); background: rgba(5,7,26,0.3); display: flex; flex-direction: column; height: 500px;"
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
      {#each stashParse as event, index (index)}
        <ActivityEvent {...event} isNew={index === 0} />
      {/each}
    </div>
  </div>
</Story>

<Story name="FailedParse">
  <div
    style="width: 380px; border-left: 1px solid rgba(74,90,173,0.12); background: rgba(5,7,26,0.3); display: flex; flex-direction: column; height: 400px;"
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
      {#each failedParse as event, index (index)}
        <ActivityEvent {...event} isNew={index === 0} />
      {/each}
    </div>
  </div>
</Story>

<Story name="FullTimeline">
  <div
    style="width: 380px; border-left: 1px solid rgba(74,90,173,0.12); background: rgba(5,7,26,0.3); display: flex; flex-direction: column; height: 700px;"
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
      {#each fullTimeline as event, index (index)}
        <ActivityEvent {...event} isNew={index === 0} />
      {/each}
    </div>
  </div>
</Story>
