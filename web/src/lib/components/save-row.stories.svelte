<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import SaveRow from "./SaveRow.svelte";

  const { Story } = defineMeta({
    title: "Components/SaveRow",
    tags: ["autodocs"],
  });
</script>

<Story name="Success">
  <div style="width: 600px; background: var(--color-panel-bg);">
    <SaveRow
      save={{
        saveUuid: "s1",
        saveName: "Hammerdin",
        summary: "Paladin · Level 89 · Hell",
        lastUpdated: "2m ago",
        status: "success",
        notes: [],
      }}
      onclick={() => alert("clicked Hammerdin")}
    />
  </div>
</Story>

<Story name="Error">
  <div style="width: 600px; background: var(--color-panel-bg);">
    <SaveRow
      save={{
        saveUuid: "s3",
        saveName: "SharedStash",
        summary: "Shared stash file",
        lastUpdated: "2m ago",
        status: "error",
        notes: [],
      }}
      onclick={() => alert("clicked SharedStash")}
    />
  </div>
</Story>

<Story name="WithNotes">
  <div style="width: 600px; background: var(--color-panel-bg);">
    <SaveRow
      save={{
        saveUuid: "s1",
        saveName: "Hammerdin",
        summary: "Paladin · Level 89 · Hell",
        lastUpdated: "2m ago",
        status: "success",
        notes: [
          {
            id: "n1",
            title: "Build Guide",
            preview: "Enigma + HotO...",
            source: "user",
            sizeBytes: 8200,
            updatedAt: "2d ago",
          },
          {
            id: "n2",
            title: "Farming Goals",
            preview: "Need Ber rune...",
            source: "user",
            sizeBytes: 340,
            updatedAt: "1d ago",
          },
        ],
      }}
      onclick={() => alert("clicked Hammerdin")}
    />
  </div>
</Story>

<Story name="InPanel">
  <div style="width: 600px; background: var(--color-panel-bg);">
    <SaveRow
      save={{
        saveUuid: "s1",
        saveName: "Hammerdin",
        summary: "Paladin · Level 89 · Hell",
        lastUpdated: "2m ago",
        status: "success",
        notes: [
          {
            id: "n1",
            title: "Build Guide",
            preview: "Enigma + HotO...",
            source: "user",
            sizeBytes: 8200,
            updatedAt: "2d ago",
          },
        ],
      }}
      onclick={() => alert("clicked")}
    />
    <SaveRow
      save={{
        saveUuid: "s2",
        saveName: "BlizzSorc",
        summary: "Sorceress · Level 76 · Nightmare",
        lastUpdated: "1d ago",
        status: "success",
        notes: [],
      }}
      onclick={() => alert("clicked")}
    />
    <SaveRow
      save={{
        saveUuid: "s3",
        saveName: "SharedStash",
        summary: "Shared stash file",
        lastUpdated: "2m ago",
        status: "error",
        notes: [],
      }}
      onclick={() => alert("clicked")}
    />
  </div>
</Story>
