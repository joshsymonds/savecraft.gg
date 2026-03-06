<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameDetailModal from "./GameDetailModal.svelte";

  const { Story } = defineMeta({
    title: "Components/GameDetailModal",
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  import type { Game, Save } from "$lib/types/source";

  const mockGame: Game = {
    gameId: "d2r",
    name: "Diablo II: Resurrected",
    statusLine: "3 saves · 2 sources",
    sourceCount: 2,
    sources: [],
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

  const emptyGame: Game = {
    gameId: "sdv",
    name: "Stardew Valley",
    statusLine: "No saves",
    sourceCount: 1,
    sources: [],
    needsConfig: false,
    saves: [],
  };

  let defaultOpen = $state(true);
  let emptyOpen = $state(true);
  let badgesOpen = $state(true);

  function handleSaveClick(save: Save) {
    console.log("Save clicked:", save.saveName);
  }

  async function handleRemoveGame(gameId: string) {
    console.log("Remove game:", gameId);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
</script>

<Story name="Default">
  {#if defaultOpen}
    <GameDetailModal
      game={mockGame}
      onclose={() => {
        defaultOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          defaultOpen = true;
        }}
      >
        REOPEN
      </button>
    </div>
  {/if}
</Story>

<Story name="EmptySaves">
  {#if emptyOpen}
    <GameDetailModal
      game={emptyGame}
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
        }}
      >
        REOPEN
      </button>
    </div>
  {/if}
</Story>

<Story name="WithSourceBadges">
  {#if badgesOpen}
    <GameDetailModal
      game={mockGame}
      showSourceBadges
      onclose={() => {
        badgesOpen = false;
      }}
      onsaveclick={handleSaveClick}
      onremovegame={handleRemoveGame}
    />
  {:else}
    <div style="display: flex; justify-content: center; padding: 48px;">
      <button
        class="demo-btn"
        onclick={() => {
          badgesOpen = true;
        }}
      >
        REOPEN
      </button>
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
