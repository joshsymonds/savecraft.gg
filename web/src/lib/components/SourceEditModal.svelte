<!--
  @component
  Stacked modal for editing a source's save path.
  Opens on top of GameConfigModal via Modal stack.
-->
<script lang="ts">
  import type { TestPathResult, ValidationState } from "$lib/types/source";

  import Modal from "./Modal.svelte";
  import WindowTitleBar from "./WindowTitleBar.svelte";

  let {
    gameName,
    gameId,
    sourceId,
    sourceName,
    initialPath = "",
    onsave,
    ontestpath,
    testPathResult = null,
    validationState = "idle",
    onclose,
  }: {
    gameName: string;
    gameId: string;
    sourceId: string;
    sourceName: string;
    initialPath?: string;
    onsave?: (sourceId: string, savePath: string) => Promise<void>;
    ontestpath?: (sourceId: string, path: string) => void;
    testPathResult?: TestPathResult | null;
    validationState?: ValidationState;
    onclose: () => void;
  } = $props();

  // Snapshot initialPath once — edits are local to this modal instance, not reactive to parent updates.
  // svelte-ignore state_referenced_locally
  let editPath = $state(initialPath);
  let saveState: "idle" | "saving" | "success" | "error" = $state("idle");
  let saveError = $state("");

  // Strip control characters (except common whitespace) from path input
  function sanitizePath(value: string): string {
    // eslint-disable-next-line no-control-regex -- intentional: strip control chars from user input
    return value.replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }

  function handlePathInput(event: Event) {
    const input = event.target as HTMLInputElement;
    editPath = sanitizePath(input.value);
    // If sanitization removed chars, sync input value
    if (input.value !== editPath) {
      input.value = editPath;
    }
  }

  // -- Debounced testPath validation --
  $effect(() => {
    if (!ontestpath) return;
    const trimmed = editPath.trim();
    if (!trimmed) return;

    const timer = setTimeout(() => {
      ontestpath(sourceId, trimmed);
    }, 500);

    return () => clearTimeout(timer);
  });

  async function handleConnect() {
    if (!onsave || !editPath.trim()) return;
    saveState = "saving";
    saveError = "";
    try {
      await onsave(sourceId, editPath.trim());
      saveState = "success";
      setTimeout(() => onclose(), 1200);
    } catch (error) {
      saveState = "error";
      saveError = error instanceof Error ? error.message : "Failed to save";
    }
  }
</script>

<Modal
  id="source-edit-{gameId}-{sourceId}"
  tiled
  onclose={() => onclose()}
  width="520px"
  ariaLabel="Edit {sourceName}"
>
  <WindowTitleBar activeLabel={gameName.toUpperCase()} activeSublabel={sourceName}>
    {#snippet right()}
      <button class="modal-close" onclick={() => onclose()}>&#x2715;</button>
    {/snippet}
  </WindowTitleBar>

  <div class="edit-section">
    {#if saveState === "success"}
      <div class="config-success">
        <span class="success-icon">&#x2713;</span>
        <span class="success-text">Connected</span>
      </div>
    {:else}
      <label class="field-label" for="save-path-input">SAVE DIRECTORY</label>
      <input
        id="save-path-input"
        type="text"
        class="path-input"
        value={editPath}
        oninput={handlePathInput}
        placeholder="Enter path to save directory..."
        disabled={saveState === "saving"}
      />

      <div class="validation-row">
        {#if validationState === "checking"}
          <span class="validation-text checking">Checking...</span>
        {:else if validationState === "valid" && testPathResult}
          <span class="validation-text valid">
            &#x2713; {testPathResult.filesFound}
            {testPathResult.filesFound === 1 ? "file" : "files"} found
          </span>
          {#if testPathResult.fileNames.length > 0}
            <div class="file-list">
              {#each testPathResult.fileNames.slice(0, 5) as fileName (fileName)}
                <span class="file-name">{fileName}</span>
              {/each}
              {#if testPathResult.fileNames.length > 5}
                <span class="file-name muted">
                  +{testPathResult.fileNames.length - 5} more
                </span>
              {/if}
            </div>
          {/if}
        {:else if validationState === "invalid"}
          <span class="validation-text invalid">&#x2715; Directory not found</span>
        {:else if validationState === "error"}
          <span class="validation-text invalid">&#x2715; Validation failed</span>
        {/if}
      </div>

      {#if saveError}
        <div class="save-error">{saveError}</div>
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    {#if saveState !== "success"}
      <button class="modal-btn" onclick={() => onclose()} disabled={saveState === "saving"}>
        CANCEL
      </button>
      <button
        class="modal-btn-primary"
        onclick={handleConnect}
        disabled={saveState === "saving" || !editPath.trim()}
      >
        {#if saveState === "saving"}
          CONNECTING...
        {:else if saveState === "error"}
          RETRY
        {:else}
          CONNECT
        {/if}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  .edit-section {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-label {
    font-family: var(--font-pixel);
    font-size: 7px;
    color: var(--color-text-muted);
    letter-spacing: 1.5px;
  }

  .path-input {
    width: 100%;
    padding: 10px 12px;
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text);
    background: rgba(74, 90, 173, 0.06);
    border: 1px solid rgba(74, 90, 173, 0.15);
    border-radius: 3px;
    outline: none;
    box-sizing: border-box;
  }

  .path-input::placeholder {
    color: var(--color-text-muted);
  }

  .path-input:focus {
    border-color: var(--color-blue);
  }

  .path-input:disabled {
    opacity: 0.6;
  }

  .validation-row {
    min-height: 20px;
  }

  .validation-text {
    font-family: var(--font-body);
    font-size: 14px;
  }

  .validation-text.checking {
    color: var(--color-text-muted);
  }

  .validation-text.valid {
    color: var(--color-green);
  }

  .validation-text.invalid {
    color: var(--color-red, #e85a5a);
  }

  .file-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-top: 6px;
  }

  .file-name {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-dim);
    background: rgba(74, 90, 173, 0.06);
    padding: 2px 6px;
    border-radius: 2px;
  }

  .file-name.muted {
    color: var(--color-text-muted);
    background: none;
  }

  .save-error {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-red, #e85a5a);
  }

  .config-success {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 0;
    animation: fade-in 0.2s ease-out;
  }

  .success-icon {
    font-size: 24px;
    color: var(--color-green, #5abe8a);
  }

  .success-text {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-green, #5abe8a);
    letter-spacing: 2px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
