<script module lang="ts">
  import type { GameSourceEntry } from "$lib/types/source";
  import { defineMeta } from "@storybook/addon-svelte-csf";

  import GameConfigModal from "./GameConfigModal.svelte";
  import SourceEditModal from "./SourceEditModal.svelte";

  const { Story } = defineMeta({
    title: "Components/GameConfigModal",
    tags: ["autodocs"],
  });

  const watchingSource: GameSourceEntry = {
    sourceId: "src-1",
    sourceName: "DAEMON · JOSH-PC",
    hostname: "josh-pc",
    status: "watching",
    path: "~/.local/share/Diablo II Resurrected/Save",
    saveCount: 3,
  };

  const notFoundSource: GameSourceEntry = {
    sourceId: "src-1",
    sourceName: "DAEMON · JOSH-PC",
    hostname: "josh-pc",
    status: "not_found",
    path: "~/Saved Games/Diablo II Resurrected",
    saveCount: 0,
  };

  const errorSource: GameSourceEntry = {
    sourceId: "src-1",
    sourceName: "DAEMON · JOSH-PC",
    hostname: "josh-pc",
    status: "error",
    path: "~/.local/share/Diablo II Resurrected/Save",
    error: "plugin crashed: exit code 1",
    saveCount: 2,
  };

  const deckSource: GameSourceEntry = {
    sourceId: "src-2",
    sourceName: "DAEMON · STEAMDECK",
    hostname: "steamdeck",
    status: "not_found",
    path: "/home/deck/.local/share/Diablo II Resurrected/Save",
    saveCount: 0,
  };

  const laptopSource: GameSourceEntry = {
    sourceId: "src-3",
    sourceName: "DAEMON · LAPTOP",
    hostname: "laptop",
    status: "watching",
    path: String.raw`C:\Users\Josh\Saved Games\Diablo II Resurrected`,
    saveCount: 5,
  };

  const availableSources = [
    { id: "src-4", name: "DAEMON · WORK-PC", hostname: "work-pc" },
    { id: "src-5", name: "DAEMON · MEDIA-SERVER", hostname: "media-server" },
  ];

  const defaultPath = "~/.local/share/Diablo II Resurrected/Save";

  const noop = (): void => {
    // intentional no-op
  };

  function succeedAfter(ms: number): () => Promise<void> {
    return () => new Promise((resolve) => setTimeout(resolve, ms));
  }
</script>

<!-- ============================================================
     GameConfigModal (overview) stories
     ============================================================ -->

<!-- Single source, watching — healthy state -->
<Story name="SingleSourceWatching">
  <div style="width: 560px; position: relative; height: 300px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[watchingSource]}
      {availableSources}
      {defaultPath}
      onclose={noop}
    />
  </div>
</Story>

<!-- Single source, not_found — auto-opens stacked editor -->
<Story name="SingleSourceNotFound">
  <div style="width: 560px; position: relative; height: 440px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[notFoundSource]}
      {availableSources}
      {defaultPath}
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- Single source, error state — auto-opens stacked editor -->
<Story name="SingleSourceError">
  <div style="width: 560px; position: relative; height: 440px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[errorSource]}
      {availableSources}
      {defaultPath}
      onclose={noop}
    />
  </div>
</Story>

<!-- Multiple sources, mixed status -->
<Story name="MultipleSources">
  <div style="width: 560px; position: relative; height: 420px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[watchingSource, deckSource, laptopSource]}
      {availableSources}
      {defaultPath}
      onclose={noop}
    />
  </div>
</Story>

<!-- No sources yet — empty state with add button -->
<Story name="NoSources">
  <div style="width: 560px; position: relative; height: 300px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[]}
      {availableSources}
      {defaultPath}
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- No sources, no available sources either -->
<Story name="NoSourcesNoDevices">
  <div style="width: 560px; position: relative; height: 280px;">
    <GameConfigModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sources={[]}
      availableSources={[]}
      {defaultPath}
      onclose={noop}
    />
  </div>
</Story>

<!-- ============================================================
     SourceEditModal (stacked editor) stories
     ============================================================ -->

<!-- Editing path, idle — no validation yet -->
<Story name="EditorIdle">
  <div style="width: 560px; position: relative; height: 320px;">
    <SourceEditModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sourceId="src-1"
      sourceName="DAEMON · JOSH-PC"
      initialPath="~/Saved Games/Diablo II Resurrected"
      validationState="idle"
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- Editing path, checking — validation in progress -->
<Story name="EditorChecking">
  <div style="width: 560px; position: relative; height: 320px;">
    <SourceEditModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sourceId="src-1"
      sourceName="DAEMON · JOSH-PC"
      initialPath="~/Saved Games/Diablo II Resurrected"
      validationState="checking"
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- Editing path, valid — files found -->
<Story name="EditorValid">
  <div style="width: 560px; position: relative; height: 400px;">
    <SourceEditModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sourceId="src-1"
      sourceName="DAEMON · JOSH-PC"
      initialPath="~/Saved Games/Diablo II Resurrected"
      validationState="valid"
      testPathResult={{
        valid: true,
        filesFound: 5,
        fileNames: ["Sorceress.d2s", "Paladin.d2s", "Amazon.d2s", "Necromancer.d2s", "Druid.d2s"],
      }}
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- Editing path, error — validation request failed -->
<Story name="EditorError">
  <div style="width: 560px; position: relative; height: 320px;">
    <SourceEditModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sourceId="src-1"
      sourceName="DAEMON · JOSH-PC"
      initialPath="~/Saved Games/Diablo II Resurrected"
      validationState="error"
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>

<!-- Editing path, invalid — directory not found -->
<Story name="EditorInvalid">
  <div style="width: 560px; position: relative; height: 320px;">
    <SourceEditModal
      gameName="Diablo II: Resurrected"
      gameId="d2r"
      sourceId="src-1"
      sourceName="DAEMON · JOSH-PC"
      initialPath="~/Saved Games/Diablo II Resurrected"
      validationState="invalid"
      onclose={noop}
      onsave={succeedAfter(800)}
    />
  </div>
</Story>
