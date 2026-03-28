<!--
  @component
  Segmented pairing code input with fixed character cells.
  Each digit occupies its own cell. Supports typing, paste, and backspace.
  Auto-submits when all cells are filled.
-->
<script lang="ts">
  const LENGTH = 6;

  let {
    onsubmit,
    buttonLabel = "PAIR",
  }: {
    /** Called when user submits the completed code. */
    onsubmit?: (code: string) => void;
    /** Label for the submit button. */
    buttonLabel?: string;
  } = $props();

  let chars = $state<string[]>(Array.from({ length: LENGTH }, () => ""));
  let hiddenInput: HTMLInputElement | undefined = $state();
  let activeIndex = $state(0);

  let isFull = $derived(chars.every((c) => c !== ""));
  let code = $derived(chars.join(""));

  function focus(index?: number) {
    if (index !== undefined) activeIndex = Math.min(index, LENGTH - 1);
    hiddenInput?.focus();
  }

  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replaceAll(/[^a-zA-Z0-9]/g, "").toUpperCase();
    input.value = "";

    if (raw.length === 0) return;

    // Paste or multi-character input: fill from activeIndex
    const next = [...chars];
    let cursor = activeIndex;
    for (const ch of raw) {
      if (cursor >= LENGTH) break;
      next[cursor] = ch;
      cursor++;
    }
    chars = next;
    activeIndex = Math.min(cursor, LENGTH - 1);

    // Auto-submit when full
    if (next.every((c) => c !== "")) {
      onsubmit?.(next.join(""));
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "Backspace": {
        event.preventDefault();
        const next = [...chars];
        if (next[activeIndex] !== "") {
          next[activeIndex] = "";
        } else if (activeIndex > 0) {
          activeIndex--;
          next[activeIndex] = "";
        }
        chars = next;
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (activeIndex > 0) activeIndex--;
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (activeIndex < LENGTH - 1) activeIndex++;
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (isFull) onsubmit?.(code);
        break;
      }
      default: {
        break;
      }
    }
  }

  function handleCellClick(index: number) {
    focus(index);
  }

  function handleBlur() {
    activeIndex = -1;
  }

  function handleFocus() {
    if (activeIndex < 0) {
      // Focus the first empty cell, or the last cell if all filled
      const firstEmpty = chars.indexOf("");
      activeIndex = firstEmpty === -1 ? LENGTH - 1 : firstEmpty;
    }
  }

  function handleSubmit() {
    if (isFull) onsubmit?.(code);
  }
</script>

<div class="pairing-code">
  <!-- Hidden input captures all keyboard/paste events -->
  <input
    bind:this={hiddenInput}
    class="hidden-input"
    type="text"
    inputmode="text"
    autocomplete="one-time-code"
    aria-label="Pairing code"
    oninput={handleInput}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    onfocus={handleFocus}
  />

  <!-- Visual cells -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="cells" role="group" aria-label="Pairing code digits">
    {#each chars as char, index (index)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="cell"
        class:active={index === activeIndex}
        class:filled={char !== ""}
        onclick={() => handleCellClick(index)}
      >
        {char || ""}
      </span>
    {/each}
  </div>

  <button class="submit-btn" onclick={handleSubmit} disabled={!isFull}>
    {buttonLabel}
  </button>
</div>

<style>
  .pairing-code {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .cells {
    display: flex;
    gap: 6px;
    cursor: text;
  }

  .cell {
    width: 32px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-pixel);
    font-size: 18px;
    color: var(--color-text);
    background: rgba(5, 7, 26, 0.6);
    border: 1px solid rgba(74, 90, 173, 0.3);
    border-radius: 3px;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .cell.active {
    border-color: var(--color-gold);
    background: rgba(200, 168, 78, 0.06);
  }

  .cell.filled {
    color: var(--color-gold-light, #e8c86e);
  }

  .submit-btn {
    font-family: var(--font-pixel);
    font-size: 12px;
    color: var(--color-gold);
    letter-spacing: 2px;
    background: rgba(200, 168, 78, 0.1);
    border: 1px solid rgba(200, 168, 78, 0.3);
    border-radius: 3px;
    padding: 10px 18px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .submit-btn:hover:not(:disabled) {
    background: rgba(200, 168, 78, 0.2);
    border-color: var(--color-gold);
  }

  .submit-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
