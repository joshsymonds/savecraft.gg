<script module lang="ts">
  import type { Source } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SourceCardGrid from "./SourceCardGrid.svelte";

  const { Story } = defineMeta({
    title: "Components/SourceCardGrid",
    tags: ["autodocs"],
  });

  const steamDeck: Source = {
    id: "steam-deck",
    name: "DAEMON · STEAM-DECK",
    sourceKind: "daemon",
    hostname: "steam-deck",
    platform: "linux",
    device: "steam_deck",
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
  };

  const windowsPC: Source = {
    id: "desktop-pc",
    name: "DAEMON · GAMING-PC",
    sourceKind: "daemon",
    hostname: "gaming-pc",
    platform: "windows",
    device: null,
    status: "offline",
    version: "v0.1.0",
    lastSeen: "3 hours ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
  };

  const macBook: Source = {
    id: "macbook",
    name: "DAEMON · MACBOOK-PRO",
    sourceKind: "daemon",
    hostname: "macbook-pro",
    platform: "darwin",
    device: null,
    status: "error",
    version: "v0.1.0",
    lastSeen: "10 min ago",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [
      {
        gameId: "d2r",
        name: "Diablo II: Resurrected",
        status: "error",
        statusLine: "Parse error",
        saves: [],
        error: "Failed to parse save file",
      },
    ],
  };

  const linuxBox: Source = {
    id: "linux-server",
    name: "DAEMON · LINUX-SERVER",
    sourceKind: "daemon",
    hostname: "linux-server",
    platform: "linux",
    device: null,
    status: "online",
    version: "v0.1.0",
    lastSeen: "now",
    capabilities: { canRescan: true, canReceiveConfig: true },
    games: [],
  };

  const wowAdapter: Source = {
    id: "wow-api",
    name: "WoW API",
    sourceKind: "adapter",
    hostname: null,
    platform: null,
    device: null,
    status: "linked",
    version: null,
    lastSeen: "3m ago",
    capabilities: { canRescan: false, canReceiveConfig: false },
    games: [
      {
        gameId: "wow",
        name: "World of Warcraft",
        status: "watching",
        statusLine: "2 characters",
        saves: [],
      },
    ],
  };
</script>

<Story name="SingleSource">
  <div style="width: 700px;">
    <SourceCardGrid
      sources={[steamDeck]}
      oncardclick={(s: Source) => alert(`Clicked: ${s.hostname ?? s.name}`)}
      onadd={() => alert("Add Source")}
    />
  </div>
</Story>

<Story name="MultipleSources">
  <div style="width: 700px;">
    <SourceCardGrid
      sources={[steamDeck, windowsPC, wowAdapter]}
      oncardclick={(s: Source) => alert(`Clicked: ${s.hostname ?? s.name}`)}
      onadd={() => alert("Add Source")}
    />
  </div>
</Story>

<Story name="AllPlatforms">
  <div style="width: 800px;">
    <SourceCardGrid
      sources={[steamDeck, windowsPC, linuxBox, macBook, wowAdapter]}
      oncardclick={(s: Source) => alert(`Clicked: ${s.hostname ?? s.name}`)}
      onadd={() => alert("Add Source")}
    />
  </div>
</Story>

<Story name="NoSources">
  <div style="width: 700px;">
    <SourceCardGrid sources={[]} onadd={() => alert("Add Source")} />
  </div>
</Story>
