<script module lang="ts">
  import type { Source } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SourceStrip from "./SourceStrip.svelte";

  const { Story } = defineMeta({
    title: "Components/SourceStrip",
    tags: ["autodocs"],
  });

  const singleSource: Source[] = [
    {
      id: "steam-deck",
      name: "DAEMON · STEAM-DECK",
      sourceKind: "daemon",
      hostname: "steam-deck",
      status: "online",
      version: "v0.1.0",
      lastSeen: "now",
      capabilities: { canRescan: true, canReceiveConfig: true },
      games: [],
    },
  ];

  const multipleSources: Source[] = [
    {
      id: "steam-deck",
      name: "DAEMON · STEAM-DECK",
      sourceKind: "daemon",
      hostname: "steam-deck",
      status: "online",
      version: "v0.1.0",
      lastSeen: "now",
      capabilities: { canRescan: true, canReceiveConfig: true },
      games: [],
    },
    {
      id: "desktop-pc",
      name: "DAEMON · DESKTOP-PC",
      sourceKind: "daemon",
      hostname: "desktop-pc",
      status: "offline",
      version: "v0.1.0",
      lastSeen: "3 hours ago",
      capabilities: { canRescan: true, canReceiveConfig: true },
      games: [],
    },
    {
      id: "api-adapter",
      name: "API",
      sourceKind: "api",
      hostname: null,
      status: "online",
      version: null,
      lastSeen: "now",
      capabilities: { canRescan: false, canReceiveConfig: false },
      games: [],
    },
  ];
</script>

<Story name="SingleSourceOnline">
  <div style="width: 700px;">
    <SourceStrip sources={singleSource} onchipclick={(s) => alert(`Clicked: ${s.hostname ?? s.name}`)} />
  </div>
</Story>

<Story name="MultipleSources">
  <div style="width: 700px;">
    <SourceStrip sources={multipleSources} onchipclick={(s) => alert(`Clicked: ${s.hostname ?? s.name}`)} />
  </div>
</Story>

<Story name="NoSources">
  <div style="width: 700px;">
    <SourceStrip sources={[]} />
  </div>
</Story>
