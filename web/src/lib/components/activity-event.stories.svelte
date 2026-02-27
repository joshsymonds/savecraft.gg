<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ActivityEvent from "./ActivityEvent.svelte";
  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/ActivityEvent",
    tags: ["autodocs"],
  });
</script>

<Story name="ParseStarted">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent type="parse_started" message="Parsing Atmus.d2s" detail="d2r" time="now" />
    </Panel>
  </div>
</Story>

<Story name="PluginStatus">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="plugin_status"
        message="Character: Atmus, Level 74 Warlock"
        detail="Atmus.d2s"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="ParseCompleted">
  <div style="width: 420px;">
    <Panel accent="#5abe8a40">
      <ActivityEvent
        type="parse_completed"
        message="Atmus, Level 74 Warlock (Hell)"
        detail="6 sections · 48KB"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="ParseFailed">
  <div style="width: 420px;">
    <Panel accent="#e85a5a40">
      <ActivityEvent
        type="parse_failed"
        message="Corrupt.d2s — corrupt file"
        detail="item 12: unexpected end of bitstream"
        time="3s"
      />
    </Panel>
  </div>
</Story>

<Story name="PushStarted">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="push_started"
        message="Uploading Atmus, Level 74 Warlock (Hell)"
        detail="48KB"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="PushCompleted">
  <div style="width: 420px;">
    <Panel accent="#5abe8a40">
      <ActivityEvent
        type="push_completed"
        message="Atmus, Level 74 Warlock (Hell)"
        detail="48KB · 340ms"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="PushFailed">
  <div style="width: 420px;">
    <Panel accent="#e85a5a40">
      <ActivityEvent
        type="push_failed"
        message="Upload failed — retrying"
        detail="d2r · timeout"
        time="5s"
      />
    </Panel>
  </div>
</Story>

<Story name="PluginUpdated">
  <div style="width: 420px;">
    <Panel accent="#c8a84e40">
      <ActivityEvent
        type="plugin_updated"
        message="D2R plugin updated to v1.2.0"
        time="3s"
        isNew={true}
      />
    </Panel>
  </div>
</Story>

<Story name="DaemonOnline">
  <div style="width: 420px;">
    <Panel accent="#5abe8a40">
      <ActivityEvent
        type="daemon_online"
        message="STEAM-DECK connected"
        detail="v0.1.0 · SteamOS 3.5"
        time="4h"
      />
    </Panel>
  </div>
</Story>

<Story name="DaemonOffline">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent type="daemon_offline" message="DESKTOP-PC disconnected" time="3h" />
    </Panel>
  </div>
</Story>

<Story name="GameDetected">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="game_detected"
        message="Diablo II: Resurrected found"
        detail="~/.local/share/Diablo II Resurrected/Save"
        time="4h"
      />
    </Panel>
  </div>
</Story>

<Story name="Watching">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent type="watching" message="Re-watching 5 files in D2R saves" time="5s" />
    </Panel>
  </div>
</Story>


<Story name="ScanStarted">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="scan_started"
        message="Scanning Diablo II: Resurrected"
        detail="~/.local/share/Diablo II Resurrected/Save"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="ScanCompleted">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="scan_completed"
        message="Scan complete: D2R"
        detail="3 files"
        time="now"
      />
    </Panel>
  </div>
</Story>

<Story name="GameNotFound">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent type="game_not_found" message="Stardew Valley not found" time="4h" />
    </Panel>
  </div>
</Story>
