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
      }}
      onclick={() => alert("clicked SharedStash")}
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
      }}
      onclick={() => alert("clicked")}
    />
  </div>
</Story>
