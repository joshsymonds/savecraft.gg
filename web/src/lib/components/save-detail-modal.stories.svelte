<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SaveDetailModal from "./SaveDetailModal.svelte";

  const { Story } = defineMeta({
    title: "Components/SaveDetailModal",
    tags: ["autodocs"],
  });
</script>

<script lang="ts">
  import type { NoteSummary, Save } from "$lib/types/source";

  const mockSave: Save = {
    saveUuid: "s1",
    saveName: "Atmus.d2s",
    summary: "Hammerdin, Level 89 Paladin",
    lastUpdated: "2 hours ago",
    status: "success",
    sourceId: "src-1",
    sourceName: "Gaming-PC",
  };

  const mockNotes: NoteSummary[] = [
    {
      id: "n1",
      title: "Build Guide",
      content:
        "Max Blessed Hammer + Concentration. Enigma for teleport. Spirit sword + shield. Hoto for extra FCR. Aim for 125% FCR breakpoint.",
      source: "user",
      sizeBytes: 427,
      updatedAt: "2 hours ago",
    },
    {
      id: "n2",
      title: "Session Log",
      content:
        "Cleared Chaos Sanctuary. Found Shako from Diablo. Need to socket with Cham for cannot be frozen. Also found a Jah rune from council members.",
      source: "user",
      sizeBytes: 312,
      updatedAt: "1 day ago",
    },
  ];

  async function loadNotesWithData(_saveUuid: string): Promise<NoteSummary[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockNotes;
  }

  async function loadNotesEmpty(_saveUuid: string): Promise<NoteSummary[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [];
  }

  async function handleNoteCreate(saveUuid: string, title: string, content: string) {
    console.log("Create note:", { saveUuid, title, content });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async function handleNoteDelete(saveUuid: string, noteId: string) {
    console.log("Delete note:", { saveUuid, noteId });
    await Promise.resolve();
  }

  async function handleNoteEdit(saveUuid: string, noteId: string, title: string, content: string) {
    console.log("Edit note:", { saveUuid, noteId, title, content });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  let defaultOpen = $state(true);
  let emptyOpen = $state(true);
</script>

<Story name="Default">
  {#if defaultOpen}
    <SaveDetailModal
      save={mockSave}
      onclose={() => {
        defaultOpen = false;
      }}
      loadNotes={loadNotesWithData}
      onnotecreate={handleNoteCreate}
      onnotedelete={handleNoteDelete}
      onnoteedit={handleNoteEdit}
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

<Story name="EmptyNotes">
  {#if emptyOpen}
    <SaveDetailModal
      save={mockSave}
      onclose={() => {
        emptyOpen = false;
      }}
      loadNotes={loadNotesEmpty}
      onnotecreate={handleNoteCreate}
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
