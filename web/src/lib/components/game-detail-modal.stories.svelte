<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameDetailModal from "./GameDetailModal.svelte";

  const { Story } = defineMeta({
    title: "Components/GameDetailModal",
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  import type { Game, GameSourceEntry, RemovedSave, Save } from "$lib/types/source";

  // -- Source fixtures --

  const watchingSource: GameSourceEntry = {
    sourceId: "src-1",
    sourceName: "DAEMON · JOSH-PC",
    hostname: "josh-pc",
    sourceKind: "daemon",
    status: "watching",
    path: "~/.local/share/Diablo II Resurrected/Save",
    saveCount: 3,
  };

  const notFoundSource: GameSourceEntry = {
    sourceId: "src-2",
    sourceName: "DAEMON · STEAMDECK",
    hostname: "steamdeck",
    sourceKind: "daemon",
    status: "not_found",
    path: "/home/deck/.local/share/Diablo II Resurrected/Save",
    saveCount: 0,
  };

  const errorSource: GameSourceEntry = {
    sourceId: "src-3",
    sourceName: "DAEMON · LAPTOP",
    hostname: "laptop",
    sourceKind: "daemon",
    status: "error",
    path: String.raw`C:\Users\Josh\Saved Games\Diablo II Resurrected`,
    error: "plugin crashed: exit code 1",
    saveCount: 2,
  };

  const adapterSource: GameSourceEntry = {
    sourceId: "src-api-1",
    sourceName: "BATTLE.NET · JOSHY#1234",
    hostname: null,
    sourceKind: "adapter",
    status: "watching",
    saveCount: 4,
  };

  const availableSources = [
    { id: "src-4", name: "DAEMON · WORK-PC", hostname: "work-pc", platform: "windows" },
    { id: "src-5", name: "DAEMON · MEDIA-SERVER", hostname: "media-server", platform: "linux" },
  ];

  const defaultPaths = {
    linux: "~/.local/share/Diablo II Resurrected/Save",
    windows: String.raw`C:\Users\<user>\Saved Games\Diablo II Resurrected`,
    darwin: "~/Library/Application Support/Diablo II Resurrected/Save",
  };

  // -- Game fixtures --

  const healthyGame: Game = {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "3 saves · 2 sources",
    sourceCount: 2,
    sources: [
      watchingSource,
      {
        ...watchingSource,
        sourceId: "src-6",
        sourceName: "DAEMON · LAPTOP",
        hostname: "laptop",
        sourceKind: "daemon",
        path: String.raw`C:\Users\Josh\Saved Games\Diablo II Resurrected`,
        saveCount: 2,
      },
    ],
    needsConfig: false,
    saves: [
      {
        saveUuid: "s1",
        saveName: "Atmus.d2s",
        summary: "Hammerdin, Level 89 Paladin",
        lastUpdated: "2 hours ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "Gaming-PC",
      },
      {
        saveUuid: "s2",
        saveName: "Blizzara.d2s",
        summary: "Blizzard Sorc, Level 78",
        lastUpdated: "1 day ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "Gaming-PC",
      },
      {
        saveUuid: "s3",
        saveName: "TrapSin.d2s",
        summary: "Lightning Traps, Level 45",
        lastUpdated: "3 days ago",
        status: "error",
        sourceId: "src-2",
        sourceName: "Steam Deck",
      },
    ],
  };

  const brokenGame: Game = {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "2 saves · 3 sources",
    sourceCount: 3,
    sources: [watchingSource, notFoundSource, errorSource],
    needsConfig: true,
    saves: [
      {
        saveUuid: "s1",
        saveName: "Atmus.d2s",
        summary: "Hammerdin, Level 89 Paladin",
        lastUpdated: "2 hours ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "DAEMON · JOSH-PC",
      },
      {
        saveUuid: "s2",
        saveName: "Blizzara.d2s",
        summary: "Blizzard Sorc, Level 78",
        lastUpdated: "1 day ago",
        status: "success",
        sourceId: "src-1",
        sourceName: "DAEMON · JOSH-PC",
      },
    ],
  };

  const singleBrokenGame: Game = {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "Needs setup",
    sourceCount: 1,
    sources: [notFoundSource],
    needsConfig: true,
    saves: [],
  };

  const emptyGame: Game = {
    gameId: "sdv",
    name: "Stardew Valley",
    statusLine: "No saves",
    sourceCount: 1,
    sources: [watchingSource],
    needsConfig: false,
    saves: [],
  };

  const noSourcesGame: Game = {
    gameId: "sdv",
    name: "Stardew Valley",
    statusLine: "No saves",
    sourceCount: 0,
    sources: [],
    needsConfig: false,
    saves: [],
  };

  // -- Handlers --

  const wowGame: Game = {
    gameId: "wow",
    name: "World of Warcraft",
    statusLine: "4 saves",
    sourceCount: 1,
    sources: [adapterSource],
    needsConfig: false,
    saves: [
      {
        saveUuid: "w1",
        saveName: "Thrallgar-Illidan-US",
        summary: "Orc Warrior · Level 80 · Illidan-US",
        lastUpdated: "3 hours ago",
        status: "success",
        sourceId: "src-api-1",
        sourceName: "BATTLE.NET · JOSHY#1234",
      },
      {
        saveUuid: "w2",
        saveName: "Moonfire-Proudmoore-US",
        summary: "Night Elf Druid · Level 80 · Proudmoore-US",
        lastUpdated: "1 day ago",
        status: "success",
        sourceId: "src-api-1",
        sourceName: "BATTLE.NET · JOSHY#1234",
      },
      {
        saveUuid: "w3",
        saveName: "Sparkplug-Illidan-US",
        summary: "Goblin Shaman · Level 72 · Illidan-US",
        lastUpdated: "3 days ago",
        status: "success",
        sourceId: "src-api-1",
        sourceName: "BATTLE.NET · JOSHY#1234",
      },
      {
        saveUuid: "w4",
        saveName: "Holyjosh-Illidan-US",
        summary: "Human Paladin · Level 45 · Illidan-US",
        lastUpdated: "1 week ago",
        status: "success",
        sourceId: "src-api-1",
        sourceName: "BATTLE.NET · JOSHY#1234",
      },
    ],
  };

  let defaultOpen = $state(true);
  let emptyOpen = $state(true);
  let badgesOpen = $state(true);
  let brokenOpen = $state(true);
  let singleBrokenOpen = $state(true);
  let noSourcesOpen = $state(true);
  let apiOpen = $state(true);

  function handleSaveClick(save: Save) {
    console.log("Save clicked:", save.saveName);
  }

  async function handleRemoveGame(gameId: string) {
    console.log("Remove game:", gameId);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  function succeedAfter(ms: number): (sourceId: string, savePath: string) => Promise<void> {
    return () => new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function handleRemoveSource(sourceId: string) {
    console.log("Remove source:", sourceId);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async function handleRestoreSave(saveUuid: string) {
    console.log("Restore save:", saveUuid);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const removedSaves: RemovedSave[] = [
    {
      saveUuid: "r1",
      saveName: "Windforce.d2s",
      summary: "Bowazon, Level 92 Amazon",
      removedAt: "2 days ago",
      noteCount: 3,
    },
    {
      saveUuid: "r2",
      saveName: "OldPaladin.d2s",
      summary: "Zealot, Level 65 Paladin",
      removedAt: "1 week ago",
      noteCount: 0,
    },
  ];
</script>

<!-- Healthy game with saves, sources, and removed saves -->
<Story name="Default">
  {#if defaultOpen}
    <GameDetailModal
      game={healthyGame}
      {availableSources}
      {defaultPaths}
      {removedSaves}
      onclose={() => {
        defaultOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
      onrestoresave={handleRestoreSave}
      onsave={succeedAfter(800)}
      onremovesource={handleRemoveSource}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          defaultOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- Game with no saves but a healthy source -->
<Story name="EmptySaves">
  {#if emptyOpen}
    <GameDetailModal
      game={emptyGame}
      {defaultPaths}
      onclose={() => {
        emptyOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          emptyOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- Multi-source game with source badges on saves -->
<Story name="WithSourceBadges">
  {#if badgesOpen}
    <GameDetailModal
      game={healthyGame}
      showSourceBadges
      {availableSources}
      {defaultPaths}
      onclose={() => {
        badgesOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
      onsave={succeedAfter(800)}
      onremovesource={handleRemoveSource}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          badgesOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- Mixed sources: 1 watching, 1 not found, 1 error — user sees saves + broken sources -->
<Story name="BrokenSources">
  {#if brokenOpen}
    <GameDetailModal
      game={brokenGame}
      showSourceBadges
      {availableSources}
      {defaultPaths}
      onclose={() => {
        brokenOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
      onsave={succeedAfter(800)}
      onremovesource={handleRemoveSource}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          brokenOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- Single broken source, no saves — previously auto-opened editor immediately -->
<Story name="SingleBrokenSource">
  {#if singleBrokenOpen}
    <GameDetailModal
      game={singleBrokenGame}
      {availableSources}
      {defaultPaths}
      onclose={() => {
        singleBrokenOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onsave={succeedAfter(800)}
      onremovesource={handleRemoveSource}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          singleBrokenOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- No sources configured, available sources to add -->
<Story name="NoSourcesWithAvailable">
  {#if noSourcesOpen}
    <GameDetailModal
      game={noSourcesGame}
      {availableSources}
      {defaultPaths}
      onclose={() => {
        noSourcesOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onsave={succeedAfter(800)}
      onremovesource={handleRemoveSource}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          noSourcesOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<!-- API game: adapter source with "API" badge, no path editor, no "ADD SOURCE" -->
<Story name="ApiAdapterGame">
  {#if apiOpen}
    <GameDetailModal
      game={wowGame}
      onclose={() => {
        apiOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          apiOpen = true;
        }}>REOPEN</button
      >
    </div>
  {/if}
</Story>

<style>
  .demo-btn {
    font-family: var(--font-pixel);
    font-size: 9px;
    letter-spacing: 1.5px;
    padding: 12px 24px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.15);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .demo-btn:hover {
    background: rgba(74, 90, 173, 0.25);
    border-color: rgba(74, 90, 173, 0.5);
  }
</style>
