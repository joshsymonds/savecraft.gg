<script module lang="ts">
  import type { Source } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SidebarSources from "./SidebarSources.svelte";

  const { Story } = defineMeta({
    title: "Components/SidebarSources",
    tags: ["autodocs"],
  });

  function makeSource(overrides: Partial<Source> = {}): Source {
    return {
      id: "src-1",
      name: "gaming-pc",
      sourceKind: "daemon",
      hostname: "GAMING-PC",
      platform: "linux",
      device: null,
      status: "online",
      version: "0.5.0",
      lastSeen: "2m ago",
      capabilities: { canRescan: true, canReceiveConfig: true },
      games: [],
      ...overrides,
    };
  }

  const sources: Source[] = [
    makeSource({ id: "a", hostname: "STEAM-DECK", status: "online" }),
    makeSource({ id: "b", hostname: "GAMING-PC", status: "online" }),
    makeSource({ id: "c", hostname: "OLD-LAPTOP", status: "offline" }),
  ];
</script>

<!-- Renders as it appears at the top of the activity sidebar. -->
<Story name="Default">
  <div
    style="width: 380px; background: rgba(5, 7, 26, 0.3); border-left: 1px solid rgba(74, 90, 173, 0.12);"
  >
    <SidebarSources {sources} oncardclick={(s) => alert(`Open: ${String(s.hostname ?? s.name)}`)} />
  </div>
</Story>

<Story name="SingleOnline">
  <div
    style="width: 380px; background: rgba(5, 7, 26, 0.3); border-left: 1px solid rgba(74, 90, 173, 0.12);"
  >
    <SidebarSources
      sources={[makeSource({ hostname: "STEAM-DECK" })]}
      oncardclick={(s) => alert(`Open: ${String(s.hostname ?? s.name)}`)}
    />
  </div>
</Story>
