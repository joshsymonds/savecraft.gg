<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import ActivityEvent from "./ActivityEvent.svelte";
  import Panel from "./Panel.svelte";

  const { Story } = defineMeta({
    title: "Components/ActivityEvent",
    tags: ["autodocs"],
  });
</script>

<Story name="ParseSuccess">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent
        type="parse_success"
        message="Parsed Hammerdin — 42KB"
        detail="Level 89 Paladin · Hell"
        time="now"
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

<Story name="ParseError">
  <div style="width: 420px;">
    <Panel accent="#e85a5a40">
      <ActivityEvent
        type="parse_error"
        message="SharedStash.d2i — unsupported format"
        detail="version 0x62"
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

<Story name="ConfigPush">
  <div style="width: 420px;">
    <Panel>
      <ActivityEvent type="config_push" message="Config pushed to DESKTOP-PC" time="1d" />
    </Panel>
  </div>
</Story>
